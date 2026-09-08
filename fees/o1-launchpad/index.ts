import { Balances, coins, util } from "@defillama/sdk";
import BigNumber from "bignumber.js";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { accountSuite, Fee } from "./accounting";
import { chainConfig, Market, Suite, ZERO } from "./config";
import { EventKind, events, Log, lower } from "./events";

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
 * @param cacheInCloud Persist genesis-to-now ranges so later hours only fill the new gap.
 * @returns Validated logs with identical copies deduplicated, or an empty array for an empty range.
 * @throws On retrieval failure, malformed logs or conflicting copies of the same event.
 */
async function readLogs(options: FetchOptions, kind: EventKind, targets: string[], fromBlock: number, toBlock: number, cacheInCloud = false): Promise<Log[]> {
  if (fromBlock > toBlock || !targets.length) return [];
  const wanted = new Set(targets.map(lower));
  const logs = await options.getLogs({
    // The SDK's RPC fallback needs a non-empty block span even for one-block requests.
    targets: [...wanted], eventAbi: events[kind], fromBlock: fromBlock === toBlock ? fromBlock - 1 : fromBlock, toBlock,
    onlyArgs: false, entireLog: true, parseLog: true, cacheInCloud,
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
 * Collect in-window activity and historical state for every live suite on this chain.
 * One getLogs per event kind covers all suite contracts; accounting still splits by address.
 * @param options Fetch context providing cached, contract-scoped log retrieval.
 * @param suites Deployments whose first block is at or before toBlock.
 * @param fromBlock Inclusive first block for fee activity.
 * @param toBlock Inclusive last block for activity and historical state.
 * @returns Window events plus relevant launch, quote, supply and fee-configuration history.
 * @throws On retrieval failure or missing creation history for a traded historical pool.
 */
async function collectSuites(options: FetchOptions, suites: Suite[], fromBlock: number, toBlock: number): Promise<Log[]> {
  if (!suites.length) return [];
  /** One call for this kind across the suites that emit it. */
  const read = (kind: EventKind, group: Suite[], cacheInCloud = false, start = fromBlock) =>
    readLogs(options, kind, group.map(suite => emitter(kind, suite)), start, toBlock, cacheInCloud);
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
  const suitesWithLaunch = new Set(suites.filter(suite => logs.some(log => log.kind === "launch" && ownedBy(suite)(log))));
  const suitesWithTrade = new Set(suites.filter(suite => logs.some(log => log.kind === "trade" && ownedBy(suite)(log))));
  logs = logs.filter(log => log.kind !== "launch");
  // History starts at the oldest suite in the group so one cached range covers every target.
  const history = (kind: EventKind, group: Suite[]) =>
    group.length ? read(kind, group, true, Math.min(...group.map(suite => suite.firstBlock))) : Promise.resolve([]);
  logs = logs.concat(await history("launch", active));
  logs = logs.concat(await history("quote", active.filter(suite => needsQuote(suite) && !suite.minimal)));
  logs = logs.concat(await history("minimalQuote", active.filter(suite => needsQuote(suite) && suite.minimal)));
  logs = logs.concat(await history("unregister", active.filter(suite => needsQuote(suite) && !suite.minimal)));
  logs = logs.concat(await history("minimalUnregister", active.filter(suite => needsQuote(suite) && suite.minimal)));
  logs = logs.concat(await history("supply", active.filter(suite => suite.route !== "standard")));
  logs = logs.concat(await history("tick", active.filter(suite => needsQuote(suite) && suite.minimal)));
  logs = logs.concat(await history("nativeFeeConfig", active.filter(suite => suite.launchFee === "native" && suitesWithLaunch.has(suite))));
  logs = logs.concat(await history("quoteFeeConfig", active.filter(suite => suite.launchFee === "quote" && suitesWithLaunch.has(suite))));
  logs = logs.concat(await history("pool", active.filter(suite => !suite.minimal && suitesWithTrade.has(suite))));
  return logs;
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
    if (suiteLogs.length) fees = fees.concat(accountSuite(suite, config.cryptoQuotes, suiteLogs, start, toBlock));
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
