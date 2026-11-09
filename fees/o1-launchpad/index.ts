import { Balances, coins, util } from "@defillama/sdk";
import BigNumber from "bignumber.js";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { accountSuite, Baseline, Fee } from "./accounting";
import { chainConfig, DEFAULT_MAX_BLOCK_RANGE, Market, Suite, ZERO } from "./config";
import { EventKind, events, Log, lower } from "./events";

/**
 * Opening-block state readers. Every suite generation exposes the same state the adapter used
 * to rebuild by replaying events from its first block; reading it point-in-time keeps refills
 * reproducible while removing all genesis-range log queries.
 * Layouts verified on-chain against every deployed Base suite on 2026-09-23.
 */
const views = {
  // Historical (non-minimal) hooks share this layout across the block, timestamp and RWA generations.
  poolConfig: "function poolConfig(bytes32 poolId) view returns (bool initialized, bool tokenIsCurrency0, address creator, address platformTreasury, uint16 baseFeeBps, uint16 creatorBps, uint16 platformBps, uint16 referrerBps, uint16 antiSnipeStartTotalBps, uint32 antiSnipeWindowSeconds, uint48 launchTime)",
  quotes: "function quotes(address quote) view returns (bool registered, uint8 decimals, int24 tick, uint256 creationFee)",
  quoteConfig: "function quoteConfig(address quote) view returns (bool registered, uint8 decimals, int24 tick)",
  launchSupply: "function launchSupply() view returns (uint256)",
  nativeLaunchFee: "function nativeLaunchFee() view returns (uint256)",
};

const markets: Market[] = ["Crypto", "Stocks"];
/** Build the fee-source and recipient labels shared by balances and their methodology. */
const labels = (market: Market) => ({
  swap: `${market} Swap Fees`,
  launch: `${market} Launch Fees`,
  protocol: `${market} Swap Fees To Protocol`,
  launchProtocol: `${market} Launch Fees To Protocol`,
  creator: `${market} Swap Fees To Creators`,
  referrer: `${market} Swap Fees To Referrers`,
});

const suiteAddresses = (suite: Suite) => new Set([suite.factory, suite.hook, suite.escrow].map(lower));
const ownedBy = (suite: Suite) => {
  const addresses = suiteAddresses(suite);
  return (log: Log) => addresses.has(log.address);
};
const emitter = (kind: EventKind, suite: Suite) => kind === "credit" ? suite.escrow
  : ["trade", "component", "pool"].includes(kind) ? suite.hook : suite.factory;

/**
 * Read one event kind from every given contract and normalize SDK/RPC log shapes.
 * @param options Fetch context providing the SDK log reader.
 * @param kind Event ABI and normalized kind to attach to each log.
 * @param targets Factory, hook or escrow addresses that emit this kind.
 * @param fromBlock Inclusive first block; single-block RPC queries are widened then filtered.
 * @param toBlock Inclusive last block.
 * Window event data is never cached: each window is a fresh range, so a cache entry can only
 * grow without being reused, and a partially written entry would silently under-report every
 * later run. This follows the repository guidance that caching is for small, slowly changing
 * config scans rather than per-window event data.
 * @returns Validated logs with identical copies deduplicated, or an empty array for an empty range.
 * @throws On retrieval failure, malformed logs or conflicting copies of the same event.
 */
async function readLogs(options: FetchOptions, kind: EventKind, targets: string[], fromBlock: number, toBlock: number, maxBlockRange: number): Promise<Log[]> {
  if (fromBlock > toBlock || !targets.length) return [];
  const wanted = new Set(targets.map(lower));
  const logs = await options.getLogs({
    // The SDK's RPC fallback needs a non-empty block span even for one-block requests.
    targets: [...wanted], eventAbi: events[kind], fromBlock: fromBlock === toBlock ? fromBlock - 1 : fromBlock, toBlock,
    onlyArgs: false, entireLog: true, parseLog: true, skipCache: true, maxBlockRange,
  });
  const unique = new Map<string, Log>();
  for (const log of logs) {
    const blockNumber = Number(log.blockNumber ?? log.block_number);
    const logIndex = Number(log.logIndex ?? log.index ?? log.log_index);
    const address = lower(log.address ?? log.source);
    const transactionHash = log.transactionHash ?? log.transaction_hash;
    if (!log.args || !Number.isInteger(blockNumber) || !Number.isInteger(logIndex)
      || !transactionHash || !wanted.has(address) || blockNumber > toBlock) {
      continue;
    }
    if (blockNumber < fromBlock) continue;
    const parsed: Log = { kind, address, transactionHash: lower(transactionHash), blockNumber, logIndex, args: log.args };
    const identity = `${parsed.transactionHash}:${logIndex}`;
    const previous = unique.get(identity);
    if (previous) {
      // Some RPC/cache responses repeat an event. Count identical copies once, but never
      // accept different payloads for the same on-chain identity.
      /** Serialize bigint fields so duplicate normalized logs can be compared. */
      const json = (args: Log) => JSON.stringify(args, (_, value) => typeof value === "bigint" ? value.toString() : value);
      if (json(previous) !== json(parsed)) continue;
    } else unique.set(identity, parsed);
  }
  return [...unique.values()];
}

/**
 * Read this window's activity and in-window state changes for every live suite on this chain.
 * One getLogs per event kind covers all suite contracts; accounting still splits by address.
 * State that predates the window is read point-in-time by {@link resolveBaseline} instead of
 * being replayed from each suite's first block, so no query reaches outside the window.
 * @param options Fetch context providing contract-scoped log retrieval.
 * @param suites Deployments whose first block is at or before toBlock.
 * @param fromBlock Inclusive first block of the window.
 * @param toBlock Inclusive last block of the window.
 * @returns Window events, including the configuration changes that occurred inside it.
 * @throws On retrieval failure, malformed logs or conflicting copies of the same event.
 */
async function collectSuites(options: FetchOptions, suites: Suite[], fromBlock: number, toBlock: number): Promise<Log[]> {
  if (!suites.length) return [];
  const maxBlockRange = chainConfig[options.chain]?.maxBlockRange ?? DEFAULT_MAX_BLOCK_RANGE;
  /** One call for this kind across the suites that emit it. */
  const read = (kind: EventKind, group: Suite[]) =>
    readLogs(options, kind, group.map(suite => emitter(kind, suite)), fromBlock, toBlock, maxBlockRange);
  let logs: Log[] = [];
  for (const kind of ["trade", "credit", "launch"] as EventKind[]) logs = logs.concat(await read(kind, suites));
  logs = logs.concat(await read("component", suites.filter(suite => suite.minimal)));
  logs = logs.concat(await read("launchFee", suites.filter(suite => !suite.minimal && suite.launchFee !== "none")));
  logs = logs.concat(await read("nativeLaunchFee", suites.filter(suite => suite.minimal && suite.launchFee !== "none")));
  if (!logs.length) return [];

  const launched = suites.filter(suite => suite.minimal && logs.some(log => log.kind === "launch" && ownedBy(suite)(log)));
  logs = logs.concat(await read("launchBuy", launched));
  const active = suites.filter(suite => logs.some(ownedBy(suite)));
  const needsQuote = (suite: Suite) => suite.launchFee !== "none" || suite.route !== "standard";
  // Configuration changes landing inside the window. Anything earlier is already in the baseline.
  logs = logs.concat(await read("pool", active.filter(suite => !suite.minimal)));
  logs = logs.concat(await read("quote", active.filter(suite => needsQuote(suite) && !suite.minimal)));
  logs = logs.concat(await read("minimalQuote", active.filter(suite => needsQuote(suite) && suite.minimal)));
  logs = logs.concat(await read("unregister", active.filter(suite => needsQuote(suite) && !suite.minimal)));
  logs = logs.concat(await read("minimalUnregister", active.filter(suite => needsQuote(suite) && suite.minimal)));
  logs = logs.concat(await read("tick", active.filter(suite => needsQuote(suite) && suite.minimal)));
  logs = logs.concat(await read("supply", active.filter(suite => suite.route !== "standard")));
  logs = logs.concat(await read("nativeFeeConfig", active.filter(suite => suite.launchFee === "native")));
  logs = logs.concat(await read("quoteFeeConfig", active.filter(suite => suite.launchFee === "quote")));
  return logs;
}

/**
 * Read one suite's state as of the block before the window opens.
 * Uses `options.fromApi`, whose calls carry that block, so a refill of an old window reads the
 * state that was live then rather than the current one. Only pools and quotes touched by this
 * window are read, which keeps the work proportional to activity rather than to chain history.
 * @param options Fetch context providing the opening-block API.
 * @param suite Deployment whose state is being resolved.
 * @param logs This suite's window logs, used to scope the lookups.
 * @param previousBlock Block immediately preceding the window.
 * @returns Pool creators and treasuries, quote configurations, launch supply and native fee.
 * @throws On call failure for a suite that was already deployed at previousBlock.
 */
async function resolveBaseline(options: FetchOptions, suite: Suite, logs: Log[], previousBlock: number): Promise<Baseline> {
  const baseline: Baseline = { pools: new Map(), quotes: new Map(), nativeFee: 0n };
  // A suite deployed inside this window has no earlier state; its events all arrive in-window.
  if (previousBlock < suite.firstBlock) return baseline;
  const api = options.fromApi;
  const of = (kind: EventKind) => logs.filter(log => log.kind === kind);
  const launchedHere = new Set(of("launch").map(log => lower(log.args.poolId)));

  // Historical suites attribute credits by creator and treasury; minimal suites use component
  // ids and never read either, so they need no pool lookup at all.
  if (!suite.minimal) {
    const traded = [...new Set(of("trade").map(log => lower(log.args.poolId)))].filter(id => !launchedHere.has(id));
    if (traded.length) {
      // No permitFailure: an unknown pool returns a zeroed struct rather than reverting, so a
      // genuine call failure must propagate instead of silently emptying the baseline.
      const configs = await api.multiCall({
        abi: views.poolConfig,
        calls: traded.map(poolId => ({ target: suite.hook, params: [poolId] })),
      });
      traded.forEach((poolId, index) => {
        const config = configs[index];
        if (!config?.initialized) return;
        baseline.pools.set(poolId, { creator: lower(config.creator), treasury: lower(config.platformTreasury) });
      });
    }
  }

  if (suite.launchFee !== "none" || suite.route !== "standard") {
    // Include quotes named only by an in-window configuration event: a tick or creation-fee
    // update is rejected by the replay unless that quote's registration is already known.
    const configKinds: EventKind[] = ["quote", "minimalQuote", "unregister", "minimalUnregister", "tick", "quoteFeeConfig"];
    const tokens = [...new Set([
      ...of("trade").map(log => lower(log.args.feeCurrency)),
      ...of("launch").map(log => lower(log.args.quote)),
      ...configKinds.flatMap(kind => of(kind).map(log => lower(log.args.quote))),
    ])];
    if (tokens.length) {
      const abi = suite.minimal ? views.quoteConfig : views.quotes;
      const configs = await api.multiCall({
        abi,
        calls: tokens.map(quote => ({ target: suite.factory, params: [quote] })),
      });
      tokens.forEach((token, index) => {
        const config = configs[index];
        if (!config?.registered) return;
        baseline.quotes.set(token, {
          registered: true, decimals: Number(config.decimals), tick: Number(config.tick),
          creationFee: suite.minimal ? 0n : BigInt(config.creationFee),
        });
      });
    }
  }

  // Both are governance parameters set once per deployment; reading them costs one call each.
  if (suite.route !== "standard")
    baseline.supply = BigInt(await api.call({ abi: views.launchSupply, target: suite.factory }));
  if (suite.launchFee === "native")
    baseline.nativeFee = BigInt(await api.call({ abi: views.nativeLaunchFee, target: suite.factory }));
  return baseline;
}

/**
 * Aggregate reconciled fees into labeled fee, protocol and supply-side balances.
 * @param options Chain context used for balances and historical-price fallback.
 * @param fees Raw fee records carrying event-time stock prices when available.
 * @returns Fee, revenue, protocol-revenue and supply-side balances with token attribution.
 * @throws If a required historical stock price is unavailable or USD valuation is non-finite.
 */
async function addFees(options: FetchOptions, fees: Fee[]) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const fallbackPrices = new Map<number, Awaited<ReturnType<typeof coins.getPrices>>>();
  const timestamps = new Map<number, number>();

  for (const fee of fees) {
    if (fee.fees === 0n) continue;
    const names = labels(fee.market);
    let stockPrice = fee.stockPrice;
    const stockCurrency = fee.market === "Stocks" && fee.currency !== ZERO;
    if (stockCurrency && stockPrice === undefined) {
      let timestamp = timestamps.get(fee.log.blockNumber);
      if (timestamp === undefined) {
        timestamp = await util.getTimestamp(fee.log.blockNumber, options.chain);
        timestamps.set(fee.log.blockNumber, timestamp);
      }
      // Batch missing stock assets at each historical hour. No current-price fallback.
      // Block timestamps are Unix seconds; one hour is 60 minutes * 60 seconds = 3600 seconds.
      const hour = Math.floor(timestamp / 3600) * 3600;
      if (!fallbackPrices.has(hour)) {
        const tokens = [...new Set(fees.filter(f => f.market === "Stocks" && f.currency !== ZERO && f.stockPrice === undefined)
          .map(f => `${options.chain}:${f.currency}`))];
        fallbackPrices.set(hour, await coins.getPrices(tokens, hour));
      }
      const price = fallbackPrices.get(hour)![`${options.chain}:${fee.currency}`];
      if (!price || !Number.isFinite(price.price) || price.price <= 0 || !Number.isInteger(price.decimals)) {
        continue;
      }
      stockPrice = price.price / 10 ** price.decimals;
    }
    /** Add a raw fee in its native token or convert Stocks units using the resolved event price. */
    const add = (balances: Balances, raw: bigint, label: string) => {
      if (stockCurrency) {
        const usd = new BigNumber(raw.toString()).times(stockPrice!).toNumber();
        if (!Number.isFinite(usd)) throw new Error(`Invalid o1 USD value for ${fee.currency}`);
        balances.addUSDValue(usd, label, { id: `${options.chain}:${fee.currency}` });
      } else if (fee.currency === ZERO) balances.addGasToken(raw, label);
      else balances.add(fee.currency, raw, label);
    };
    add(dailyFees, fee.fees, fee.launch ? names.launch : names.swap);
    add(dailyRevenue, fee.revenue, fee.launch ? names.launchProtocol : names.protocol);
    add(dailySupplySideRevenue, fee.creator, names.creator);
    add(dailySupplySideRevenue, fee.referrer, names.referrer);
  }
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
}

/**
 * Collect and account for every configured suite on the requested chain.
 * @param options V2 fetch context; its starting boundary block is excluded and ending block included.
 * @returns Fee and revenue dimensions aggregated across the chain's historical deployments.
 * @throws On unsupported chains, invalid block ranges, or any collection, accounting or pricing failure.
 */
const fetch = async (options: FetchOptions) => {
  const config = chainConfig[options.chain];
  if (!config) throw new Error(`Unsupported o1 Launchpad chain ${options.chain}`);
  // The start block is the previous period's ending block. Exclude it so adjacent
  // hourly windows cannot count the same block twice.
  const previousBlock = await options.getFromBlock();
  const toBlock = await options.getToBlock();
  if (!Number.isInteger(previousBlock) || previousBlock <= 0 || !Number.isInteger(toBlock) || toBlock < previousBlock)
    throw new Error("Invalid o1 Launchpad block interval");
  const fromBlock = previousBlock + 1;
  const suites = config.suites.filter(suite => suite.firstBlock <= toBlock);
  const logs = await collectSuites(options, suites, fromBlock, toBlock);
  let fees: Fee[] = [];
  for (const suite of suites) {
    const start = Math.max(fromBlock, suite.firstBlock);
    const suiteLogs = logs.filter(ownedBy(suite));
    if (!suiteLogs.length) continue;
    const baseline = await resolveBaseline(options, suite, suiteLogs, previousBlock);
    fees = fees.concat(accountSuite(suite, config.cryptoQuotes, suiteLogs, start, toBlock, baseline));
  }
  return addFees(options, fees);
};

const methodology = {
  Fees: "Quote-denominated swap fees from Hook Trade events plus token-launch payment events across configured suites. Legacy launch-token-denominated swap fees are excluded because reliable historical USD valuation is unavailable. Crypto uses token balances; Stocks use the event-time factory tick reference price under the documented $4,000 opening-cap convention, with historical DefiLlama prices only when that reference is unavailable.",
  Revenue: "Actual platform and protocol-owned fixed-component swap credits, plus token-launch fees. Includes anti-snipe surcharges, referral fallback and rounding retained by the protocol. Claims do not count again.",
  ProtocolRevenue: "Swap and launch fees retained by the protocol treasury.",
  SupplySideRevenue: "Actual swap credits allocated to creators and referrers, including amounts still unclaimed.",
};
const revenueBreakdown = Object.fromEntries(markets.flatMap(m => [
  [labels(m).protocol, `${m} swap fees credited to the protocol, including treasury-owned fixed components.`],
  [labels(m).launchProtocol, `${m} token-launch fees paid to the protocol.`],
]));
const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology: {
    Fees: Object.fromEntries(markets.flatMap(m => [
      [labels(m).swap, `${m} quote-denominated swap fees, including anti-snipe surcharges.`],
      [labels(m).launch, `${m} token-launch fees from Factory payment events.`],
    ])),
    Revenue: revenueBreakdown,
    ProtocolRevenue: revenueBreakdown,
    SupplySideRevenue: Object.fromEntries(markets.flatMap(m => [
      [labels(m).creator, `${m} swap fees credited to token creators.`],
      [labels(m).referrer, `${m} swap fees credited to valid referrers.`],
    ])),
  },
};

export default adapter;
