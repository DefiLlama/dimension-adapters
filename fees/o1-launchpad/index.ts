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

/**
 * Read one event kind from its suite contract and normalize SDK/RPC log shapes.
 * @param options Fetch context providing the SDK log reader.
 * @param suite Deployment used to select the emitting contract.
 * @param kind Event ABI and normalized kind to attach to each log.
 * @param fromBlock Inclusive first block; single-block RPC queries are widened then filtered.
 * @param toBlock Inclusive last block.
 * @returns Validated logs with identical copies deduplicated, or an empty array for an empty range.
 * @throws On retrieval failure, malformed logs or conflicting copies of the same event.
 */
async function readLogs(options: FetchOptions, suite: Suite, kind: EventKind, fromBlock: number, toBlock: number): Promise<Log[]> {
  if (fromBlock > toBlock) return [];
  const target = kind === "credit" ? suite.escrow
    : ["trade", "component", "pool"].includes(kind) ? suite.hook : suite.factory;
  const logs = await options.getLogs({
    // The SDK's RPC fallback needs a non-empty block span even for one-block requests.
    targets: [target], eventAbi: events[kind], fromBlock: fromBlock === toBlock ? fromBlock - 1 : fromBlock, toBlock,
    onlyArgs: false, entireLog: true, parseLog: true,
  });
  const unique = new Map<string, Log>();
  for (const log of logs) {
    const blockNumber = Number(log.blockNumber ?? log.block_number);
    const logIndex = Number(log.logIndex ?? log.index ?? log.log_index);
    const address = lower(log.address ?? log.source);
    const transactionHash = log.transactionHash ?? log.transaction_hash;
    if (!log.args || !Number.isInteger(blockNumber) || !Number.isInteger(logIndex)
      || !transactionHash || address !== target || blockNumber > toBlock)
      throw new Error(`Invalid o1 Launchpad ${kind} log from ${target}`);
    if (blockNumber < fromBlock) continue;
    const parsed: Log = { kind, address, transactionHash: lower(transactionHash), blockNumber, logIndex, args: log.args };
    const identity = `${parsed.transactionHash}:${logIndex}`;
    const previous = unique.get(identity);
    if (previous) {
      // Some RPC/cache responses repeat an event. Count identical copies once, but never
      // accept different payloads for the same on-chain identity.
      /** Serialize bigint fields so duplicate normalized logs can be compared. */
      const json = (args: Log) => JSON.stringify(args, (_, value) => typeof value === "bigint" ? value.toString() : value);
      if (json(previous) !== json(parsed)) throw new Error(`Conflicting o1 Launchpad log ${identity}`);
    } else unique.set(identity, parsed);
  }
  return [...unique.values()];
}

/**
 * Collect in-window activity and the historical state required to replay its accounting.
 * @param options Fetch context providing cached, contract-scoped log retrieval.
 * @param suite Deployment defining applicable event generations and launch-fee behavior.
 * @param fromBlock Inclusive first block for fee activity.
 * @param toBlock Inclusive last block for activity and historical state.
 * @returns Window events plus relevant launch, quote, supply and fee-configuration history.
 * @throws On retrieval failure or missing creation history for a traded historical pool.
 */
async function collectSuite(options: FetchOptions, suite: Suite, fromBlock: number, toBlock: number): Promise<Log[]> {
  const windowKinds: EventKind[] = ["trade", "credit", "launch"];
  if (suite.minimal) windowKinds.push("component");
  if (suite.launchFee !== "none") windowKinds.push(suite.minimal ? "nativeLaunchFee" : "launchFee");
  let logs: Log[] = [];
  for (const kind of windowKinds) logs = logs.concat(await readLogs(options, suite, kind, fromBlock, toBlock));
  if (!logs.length) return [];

  const hasLaunches = logs.some(log => log.kind === "launch");
  const hasTrades = logs.some(log => log.kind === "trade");
  if (suite.minimal && hasLaunches) logs = logs.concat(await readLogs(options, suite, "launchBuy", fromBlock, toBlock));
  // SDK getLogs caches historical ranges and only fills gaps. Old pools and quote state
  // remain necessary even when the requested hour contains no new launches.
  const historyKinds: EventKind[] = ["launch"];
  if (suite.launchFee !== "none" || suite.route !== "standard") {
    historyKinds.push(suite.minimal ? "minimalQuote" : "quote", suite.minimal ? "minimalUnregister" : "unregister");
    if (suite.route !== "standard") historyKinds.push("supply");
    if (suite.minimal) historyKinds.push("tick");
  }
  if (hasLaunches && suite.launchFee === "native") historyKinds.push("nativeFeeConfig");
  if (hasLaunches && suite.launchFee === "quote") historyKinds.push("quoteFeeConfig");
  logs = logs.filter(log => log.kind !== "launch");
  for (const kind of historyKinds) logs = logs.concat(await readLogs(options, suite, kind, suite.firstBlock, toBlock));
  if (!suite.minimal && hasTrades) {
    // PoolRegistered is emitted in the pool's creation transaction. Read only the
    // creation-block span of pools trading now, not the entire lifetime of the hook.
    const tradedPools = new Set(logs.filter(log => log.kind === "trade").map(log => lower(log.args.poolId)));
    const creations = logs.filter(log => log.kind === "launch" && tradedPools.has(lower(log.args.poolId)));
    if (creations.length !== tradedPools.size) throw new Error(`Missing o1 pool creation history for ${suite.hook}`);
    const first = creations.reduce((block, log) => Math.min(block, log.blockNumber), toBlock);
    const last = creations.reduce((block, log) => Math.max(block, log.blockNumber), suite.firstBlock);
    logs = logs.concat(await readLogs(options, suite, "pool", first, last));
  }
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
      const hour = Math.floor(timestamp / 3600) * 3600;
      if (!fallbackPrices.has(hour)) {
        const tokens = [...new Set(fees.filter(f => f.market === "Stocks" && f.currency !== ZERO && f.stockPrice === undefined)
          .map(f => `${options.chain}:${f.currency}`))];
        fallbackPrices.set(hour, await coins.getPrices(tokens, hour));
      }
      const price = fallbackPrices.get(hour)![`${options.chain}:${fee.currency}`];
      if (!price || !Number.isFinite(price.price) || price.price <= 0 || !Number.isInteger(price.decimals))
        throw new Error(`Missing historical o1 stock price ${options.chain}:${fee.currency} at ${hour}`);
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
  let fees: Fee[] = [];
  for (const suite of config.suites) {
    if (suite.firstBlock > toBlock) continue;
    const start = Math.max(fromBlock, suite.firstBlock);
    const logs = await collectSuite(options, suite, start, toBlock);
    if (logs.length) fees = fees.concat(accountSuite(suite, config.cryptoQuotes, logs, start, toBlock));
  }
  return addFees(options, fees);
};

const methodology = {
  Fees: "Quote-denominated swap fees from Hook Trade events plus token-launch payment events across all historical suites. Legacy launch-token-denominated swap fees are excluded because reliable historical USD valuation is unavailable. Crypto uses token balances; Stocks use the event-time factory tick reference price under the documented $4,000 opening-cap convention, with historical DefiLlama prices only when that reference is unavailable.",
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
