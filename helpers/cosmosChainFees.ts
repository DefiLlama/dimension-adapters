import { log } from "@defillama/sdk";
import { PromisePool } from "@supercharge/promise-pool";
import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { httpPost } from "../utils/fetchURL";
import { CHAIN } from "./chains";
import { METRIC } from "./metrics";

export type CosmosDenomConfig = {
  cgToken: string;
  decimals: number;
};

export type CosmosChainMetricConfig = {
  chain: string;
  rpcs: string[]; 
  denoms: Record<string, CosmosDenomConfig>;
  start?: string;
  blockWindowSize?: number; // heights per tx_search query
  windowConcurrency?: number;
  rpcTimeoutMs?: number;
};

export type CosmosChainMetrics = {
  activeUsers: number;
  transactionCount: number;
  totalGasUsed: number;
  feesByDenom: Record<string, number>;
};

type CosmosChainMetricsAccumulator = CosmosChainMetrics & {
  users: Set<string>;
};

type BlockRange = {
  fromBlock: number;
  toBlock: number;
};

// minimal shapes of the CometBFT RPC payloads this helper reads
type CometBftEventAttribute = { key?: string; value?: string };
type CometBftEvent = { type?: string; attributes?: CometBftEventAttribute[] };
type CometBftTxResult = { code?: number | string; gas_wanted?: string; gas_used?: string; events?: CometBftEvent[] };
type CometBftTx = { hash?: string; height?: string; tx_result?: CometBftTxResult };
type TxSearchResponse = { txs?: CometBftTx[]; total_count?: string };
type BlockResponse = { block: { header: { time: string } } };
type StatusResponse = { sync_info: { earliest_block_height: string; latest_block_height: string; earliest_block_time: string } };

const TX_SEARCH_PAGE_SIZE = 100; // CometBFT maximum
const DEFAULT_BLOCK_WINDOW_SIZE = 1_000;
const DEFAULT_WINDOW_CONCURRENCY = 10;
const DEFAULT_RPC_TIMEOUT_MS = 30_000;
const DEFAULT_SINGLE_RPC_ATTEMPTS = 2;
// standard cosmos-sdk fee event plus the feemarket module events that replace it
// on chains like Cosmos Hub and Neutron
const FEE_EVENT_TYPES = ["tx", "fee_pay"];
const TIP_EVENT_TYPE = "tip_pay";
const preferredRpcSender: Record<string, string | undefined> = {};
const failedRpcSenders: Record<string, Set<string> | undefined> = {};

/**
 * Shared configs for cosmos-sdk chains that derive chain metrics directly from RPC tx results.
 */
export const COSMOS_CHAIN_METRIC_CONFIGS: Record<string, CosmosChainMetricConfig> = {
  cosmoshub: {
    chain: CHAIN.COSMOS,
    start: "2021-02-18",
    // endpoints must allow height-range tx_search queries (publicnode does not)
    rpcs: [
      "https://rpc.cosmos.directory/cosmoshub",
      "https://cosmos-rpc.polkachu.com",
    ],
    denoms: {
      uatom: { cgToken: "cosmos", decimals: 6 },
    },
  },
  osmosis: {
    chain: CHAIN.COSMOS,
    start: "2022-04-15",
    rpcs: [
      "https://rpc.osmosis.zone",
      "https://osmosis-rpc.polkachu.com",
      "https://osmosis.rpc.kjnodes.com",
      "https://rpc.cosmos.directory/osmosis",
    ],
    windowConcurrency: 6,
    denoms: {
      uosmo: { cgToken: "osmosis", decimals: 6 },
      // ATOM and USDC (Noble) over IBC, common alternative fee denoms on osmosis-1
      "ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2": { cgToken: "cosmos", decimals: 6 },
      "ibc/498A0751C798A0D9A389AA3691123DADA57DAA4FE165D5C75894505B876BA6E4": { cgToken: "usd-coin", decimals: 6 },
    },
  },
  neutron: {
    chain: CHAIN.NEUTRON,
    start: "2023-05-10",
    rpcs: [
      "https://rpc.cosmos.directory/neutron",
      "https://neutron-rpc.polkachu.com",
    ],
    denoms: {
      untrn: { cgToken: "neutron-3", decimals: 6 },
      // ATOM and USDC (Noble) over IBC, both accepted as fee denoms on neutron-1
      "ibc/C4CFF46FD6DE35CA4CF4CE031E643C8FDC9BA4B99AE598E9B0ED98FE3A2319F9": { cgToken: "cosmos", decimals: 6 },
      "ibc/B559A80D62249C8AA07A380E2A2BEA6E5CA9A6F079C912C3A9E9B494105E4F81": { cgToken: "usd-coin", decimals: 6 },
    },
  },
};

const baseMethodology = {
  Fees: "Transaction fees paid by users, taken from the fee declared in every transaction of every block.",
  Revenue: "The chain itself keeps no fees.",
  SupplySideRevenue: "All transaction fees are distributed to validators and delegators.",
};

export const GAS_FEES_TO_VALIDATORS_LABEL = "Transaction Gas Fees To Validators";

const baseBreakdownMethodology = {
  Fees: {
    [METRIC.TRANSACTION_GAS_FEES]: "Sum of the fee (and priority tip on feemarket chains) of all transactions in the day's block range, read from tx_search fee events.",
  },
  SupplySideRevenue: {
    [GAS_FEES_TO_VALIDATORS_LABEL]: "All transaction fees are distributed to validators and delegators.",
  },
};

/**
 * Splits an inclusive block range into deterministic windows for tx_search queries.
 */
export function makeBlockWindows(fromBlock: number, toBlock: number, windowSize = DEFAULT_BLOCK_WINDOW_SIZE): BlockRange[] {
  if (!Number.isInteger(windowSize) || windowSize < 1) throw new Error(`invalid block window size: ${windowSize}`);
  if (fromBlock > toBlock) return [];
  const windows: BlockRange[] = [];
  for (let block = fromBlock; block <= toBlock; block += windowSize) {
    windows.push({ fromBlock: block, toBlock: Math.min(block + windowSize - 1, toBlock) });
  }
  return windows;
}

/**
 * Reduces tx_search results into the metrics accumulator.
 * Vote-extension/oracle payloads (e.g. Slinky prices on Neutron) are injected into blocks
 * as pseudo-transactions that fail decoding (no gas, no events, non-zero code) and are skipped.
 */
function accumulateTxResults(metrics: CosmosChainMetricsAccumulator, txs: CometBftTx[]) {
  for (const tx of txs) {
    const txResult = tx.tx_result;
    if (!txResult) throw new Error(`malformed tx_search result for tx ${tx.hash}: missing tx_result`);
    // CometBFT JSON omits zero-valued fields: an absent code/gas/events means 0/empty, not missing data
    if (Number(txResult.code ?? 0) !== 0 && Number(txResult.gas_wanted ?? 0) === 0 && !(txResult.events?.length)) continue;
    metrics.transactionCount += 1;
    metrics.totalGasUsed += Number(txResult.gas_used ?? 0);
    const events = txResult.events ?? [];
    addCoins(metrics.feesByDenom, getEventAttribute(events, FEE_EVENT_TYPES, "fee"));
    addCoins(metrics.feesByDenom, getEventAttribute(events, [TIP_EVENT_TYPE], "tip"));
    for (const sender of getTxSenders(events)) metrics.users.add(sender);
  }
}

/**
 * Fetches all transactions of one height window through paginated tx_search queries.
 */
async function getWindowTxs(config: CosmosChainMetricConfig, window: BlockRange): Promise<CometBftTx[]> {
  const txs: CometBftTx[] = [];
  let page = 1;
  let totalCount = 0;
  while (true) {
    const result = await rpcCall<TxSearchResponse>(config, "tx_search", {
      query: `tx.height>=${window.fromBlock} AND tx.height<=${window.toBlock}`,
      page: String(page),
      per_page: String(TX_SEARCH_PAGE_SIZE),
      order_by: "asc",
    }, (r) => {
      if (!Number.isFinite(Number(r?.total_count)) || !Array.isArray(r?.txs ?? [])) {
        throw new Error(`malformed tx_search response for blocks ${window.fromBlock}-${window.toBlock}: ${JSON.stringify(r).slice(0, 200)}`);
      }
    });
    totalCount = Number(result.total_count);
    txs.push(...(result.txs ?? []));
    // requesting a page past the last one is an error, so stop on the page that completes the set
    if (!result.txs?.length || txs.length >= totalCount) break;
    page++;
  }
  if (txs.length < totalCount) {
    throw new Error(`${config.chain}: tx_search returned ${txs.length}/${totalCount} txs for blocks ${window.fromBlock}-${window.toBlock}`);
  }
  return txs;
}

/**
 * Fetches raw cosmos chain metrics for an inclusive block range.
 */
export async function fetchCosmosChainMetrics(config: CosmosChainMetricConfig & BlockRange): Promise<CosmosChainMetrics> {
  assertValidBlockRange(config.chain, config.fromBlock, config.toBlock);
  const windows = makeBlockWindows(config.fromBlock, config.toBlock, config.blockWindowSize);
  const totals = emptyMetricsAccumulator();

  const { errors } = await PromisePool
    .withConcurrency(config.windowConcurrency ?? DEFAULT_WINDOW_CONCURRENCY)
    .for(windows)
    .process(async (window) => {
      const txs = await getWindowTxs(config, window).catch((error) => {
        log(`${config.chain}: retrying blocks ${window.fromBlock}-${window.toBlock} after: ${error?.message}`);
        return getWindowTxs(config, window);
      });
      accumulateTxResults(totals, txs);
    });

  if (errors.length) throw getPoolError(errors);
  return toPublicMetrics(totals);
}

/**
 * Sends a single JSON-RPC call through healthy senders with per-endpoint retries.
 */
async function rpcCall<T>(config: CosmosChainMetricConfig, method: string, params?: Record<string, string>, validateResult?: (result: T) => void): Promise<T> {
  let lastError: unknown;
  for (const rpc of getOrderedRpcSenders(config, method)) {
    for (let attempt = 0; attempt < DEFAULT_SINGLE_RPC_ATTEMPTS; attempt++) {
      try {
        const res = await httpPost(rpc, { jsonrpc: "2.0", id: 1, method, params }, { timeout: config.rpcTimeoutMs ?? DEFAULT_RPC_TIMEOUT_MS });
        if (res.error) throw new Error(`${method} failed on ${rpc}: ${JSON.stringify(res.error)}`);
        const result = res.result as T;
        validateResult?.(result);
        markRpcSenderSuccess(config, method, rpc);
        return result;
      } catch (error: any) {
        if (error?.axiosError) error.message = `${method} on ${rpc}: ${error.message}: ${JSON.stringify(error.axiosError).slice(0, 300)}`;
        lastError = error;
        if (isPrunedHeightError(error)) break;
        await sleep((isRateLimitError(error) ? 1500 : 250) * (attempt + 1));
      }
    }
    // a rate-limited endpoint is healthy, just throttled - keep it in the rotation
    if (!isPrunedHeightError(lastError) && !isRateLimitError(lastError)) markRpcSenderFailure(config, method, rpc);
  }
  throw lastError ?? new Error(`${config.chain}: no RPC sender available for ${method}`);
}

/**
 * Coverage is the union of what every configured RPC reports: nodes (and the ones behind
 * load-balanced endpoints like cosmos.directory) prune to different depths.
 */
async function getChainStatus(config: CosmosChainMetricConfig) {
  const { results } = await PromisePool
    .withConcurrency(4)
    .for(config.rpcs)
    .process(async (rpc) => {
      const res = await httpPost(rpc, { jsonrpc: "2.0", id: 1, method: "status" }, { timeout: config.rpcTimeoutMs ?? DEFAULT_RPC_TIMEOUT_MS });
      return res.result as StatusResponse;
    });
  const statuses = results.filter((status) => status?.sync_info);
  if (!statuses.length) throw new Error(`${config.chain}: no RPC endpoint responded to status`);
  return {
    earliest: Math.max(Math.min(...statuses.map((s) => Number(s.sync_info.earliest_block_height))), 1),
    latest: Math.max(...statuses.map((s) => Number(s.sync_info.latest_block_height))),
    earliestTime: Math.min(...statuses.map((s) => Math.floor(Date.parse(s.sync_info.earliest_block_time) / 1000))),
  };
}

/**
 * Returns the block time, or null when the height is pruned on every endpoint.
 * Cached: block times are immutable and consecutive searches re-probe the same heights.
 */
const blockTimeCache = new Map<string, number>();
async function getBlockTime(config: CosmosChainMetricConfig, height: number): Promise<number | null> {
  const cacheKey = `${config.chain}:${height}`;
  const cached = blockTimeCache.get(cacheKey);
  if (cached !== undefined) return cached;
  try {
    const result = await rpcCall<BlockResponse>(config, "block", { height: String(height) }, (r) => {
      if (!r?.block?.header?.time) throw new Error(`block ${height} returned without header data`);
    });
    const time = Math.floor(Date.parse(result.block.header.time) / 1000);
    if (blockTimeCache.size > 100_000) blockTimeCache.clear();
    blockTimeCache.set(cacheKey, time);
    return time;
  } catch (error: any) {
    if (isPrunedHeightError(error)) return null;
    throw error;
  }
}

/**
 * Binary-searches the first block at or after the target timestamp. Pruned heights are
 * treated as "too old", which walks the window up into the range the RPCs still serve.
 */
async function findHeightAtTimestamp(config: CosmosChainMetricConfig, targetTimestamp: number, earliest: number, latest: number): Promise<number> {
  let low = earliest;
  let high = latest;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const time = await getBlockTime(config, mid);
    if (time === null || time < targetTimestamp) low = mid + 1;
    else high = mid;
  }
  return low;
}

/**
 * Resolves a timestamp window to an inclusive block range, throwing instead of silently
 * undercounting when the range is pruned on every configured RPC.
 */
export async function getBlockRangeForTimestamps(config: CosmosChainMetricConfig, startTimestamp: number, endTimestamp: number): Promise<BlockRange> {
  const { earliest, latest, earliestTime } = await getChainStatus(config);
  if (startTimestamp < earliestTime) {
    throw new Error(`${config.chain}: configured RPCs have blocks only from ${new Date(earliestTime * 1000).toISOString()}. Use an archive RPC to backfill.`);
  }

  const fromBlock = await findHeightAtTimestamp(config, startTimestamp, earliest, latest);
  // endTimestamp may be beyond the current tip (partial day/hour): latest + 1 as the
  // search sentinel lets the window resolve through the latest block instead of dropping it
  const toBlock = (await findHeightAtTimestamp(config, endTimestamp, fromBlock, latest + 1)) - 1;
  assertValidBlockRange(config.chain, fromBlock, toBlock);

  // a first block landing hours into the window means its start was pruned on every
  // endpoint (upgrade halts are shorter) - fail instead of silently undercounting
  const fromBlockTime = await getBlockTime(config, fromBlock);
  if (fromBlockTime === null || fromBlockTime - startTimestamp > 2 * 3600) {
    throw new Error(`${config.chain}: blocks at ${new Date(startTimestamp * 1000).toISOString()} are pruned on all configured RPCs. Use an archive RPC to backfill.`);
  }
  return { fromBlock, toBlock };
}

/**
 * Creates a chain protocol fees adapter backed by raw CometBFT RPC tx results.
 */
export function createCosmosChainFeesAdapter(config: CosmosChainMetricConfig): SimpleAdapter {
  return {
    version: 2,
    pullHourly: true,
    protocolType: ProtocolType.CHAIN,
    isExpensiveAdapter: true,
    chains: [config.chain],
    start: config.start,
    methodology: baseMethodology,
    breakdownMethodology: baseBreakdownMethodology,
    fetch: async (options: FetchOptions) => {
      const { fromBlock, toBlock } = await getBlockRangeForTimestamps(config, options.startTimestamp, options.endTimestamp);
      log(`${config.chain}: computing chain fees over blocks ${fromBlock}-${toBlock} (${toBlock - fromBlock + 1} blocks)`);
      const metrics = await fetchCosmosChainMetrics({ ...config, fromBlock, toBlock });
      const dailyFees = options.createBalances();
      const dailySupplySideRevenue = options.createBalances();

      const unknownDenoms: string[] = [];
      for (const [denom, amount] of Object.entries(metrics.feesByDenom)) {
        const denomConfig = config.denoms[denom];
        if (!denomConfig) {
          unknownDenoms.push(`${amount}${denom}`);
          continue;
        }
        dailyFees.addCGToken(denomConfig.cgToken, amount / 10 ** denomConfig.decimals, METRIC.TRANSACTION_GAS_FEES);
        dailySupplySideRevenue.addCGToken(denomConfig.cgToken, amount / 10 ** denomConfig.decimals, GAS_FEES_TO_VALIDATORS_LABEL);
      }
      if (unknownDenoms.length) log(`${config.chain}: skipped fees in unmapped denoms: ${unknownDenoms.join(", ")}`);

      return {
        dailyFees,
        dailyRevenue: 0,
        dailyHoldersRevenue: 0,
        dailySupplySideRevenue,
        dailyTransactionsCount: metrics.transactionCount,
        dailyGasUsed: metrics.totalGasUsed,
      };
    },
  };
}

/**
 * Creates an active-users fetcher that reuses the same tx-search metrics as the fees adapter.
 */
export function createCosmosChainUsersFetcher(config: CosmosChainMetricConfig) {
  return async (startTimestamp: number, endTimestamp: number) => {
    const { fromBlock, toBlock } = await getBlockRangeForTimestamps(config, startTimestamp, endTimestamp);
    const metrics = await fetchCosmosChainMetrics({ ...config, fromBlock, toBlock });
    return [{
      usercount: metrics.activeUsers,
      txcount: metrics.transactionCount,
    }];
  };
}

/**
 * Orders senders by cached health for the specific chain and RPC method: last successful
 * endpoint first, previously failed ones last. Failed endpoints are deprioritized rather
 * than excluded, so a transient failure never permanently removes an endpoint.
 */
function getOrderedRpcSenders(config: CosmosChainMetricConfig, method: string): string[] {
  const cacheKey = getRpcMethodCacheKey(config, method);
  const failed = failedRpcSenders[cacheKey];
  const preferred = preferredRpcSender[cacheKey];
  const rank = (rpc: string) => {
    const key = getRpcSenderKey(config, rpc);
    if (key === preferred) return 0;
    if (failed?.has(key)) return 2;
    return 1;
  };
  return [...config.rpcs].sort((left, right) => rank(left) - rank(right));
}

function getRpcSenderKey(config: CosmosChainMetricConfig, rpc: string) {
  return `${config.chain}:${rpc}`;
}

function getRpcMethodCacheKey(config: CosmosChainMetricConfig, method: string) {
  return `${config.chain}:${method}`;
}

function markRpcSenderSuccess(config: CosmosChainMetricConfig, method: string, rpc: string) {
  const cacheKey = getRpcMethodCacheKey(config, method);
  preferredRpcSender[cacheKey] = getRpcSenderKey(config, rpc);
  failedRpcSenders[cacheKey]?.delete(getRpcSenderKey(config, rpc));
}

function markRpcSenderFailure(config: CosmosChainMetricConfig, method: string, rpc: string) {
  const cacheKey = getRpcMethodCacheKey(config, method);
  if (preferredRpcSender[cacheKey] === getRpcSenderKey(config, rpc)) delete preferredRpcSender[cacheKey];
  if (!failedRpcSenders[cacheKey]) failedRpcSenders[cacheKey] = new Set<string>();
  failedRpcSenders[cacheKey]!.add(getRpcSenderKey(config, rpc));
}

function getEventAttribute(events: CometBftEvent[], eventTypes: string[], attributeKey: string): string | undefined {
  for (const event of events) {
    if (!event.type || !eventTypes.includes(event.type)) continue;
    for (const attribute of event.attributes ?? []) {
      if (attribute.key === attributeKey) return attribute.value;
    }
  }
  return undefined;
}

function getEventAttributes(events: CometBftEvent[], eventTypes: string[], attributeKey: string): string[] {
  const values: string[] = [];
  for (const event of events) {
    if (!event.type || !eventTypes.includes(event.type)) continue;
    for (const attribute of event.attributes ?? []) {
      if (attribute.key === attributeKey && attribute.value) values.push(attribute.value);
    }
  }
  return values;
}

/**
 * Extracts every signer address from the acc_seq ("cosmos1.../41") tx event attributes -
 * multisig transactions emit one per signer - falling back to the fee_payer attribute.
 */
function getTxSenders(events: CometBftEvent[]): string[] {
  const accSeqs = getEventAttributes(events, ["tx"], "acc_seq");
  if (accSeqs.length) return accSeqs.map((accSeq) => accSeq.split("/")[0]);
  return getEventAttributes(events, ["tx", "fee_pay"], "fee_payer");
}

/**
 * Parses a cosmos coins string like "395uatom" or "100uosmo,20ibc/ABC..." into amounts by denom.
 */
function addCoins(feesByDenom: Record<string, number>, coins: string | undefined) {
  if (!coins) return;
  for (const coin of coins.split(",")) {
    const match = coin.trim().match(/^(\d+)(.+)$/);
    if (!match) continue;
    const [, amount, denom] = match;
    feesByDenom[denom] = (feesByDenom[denom] ?? 0) + Number(amount);
  }
}

function isPrunedHeightError(error: unknown): boolean {
  return /lowest height|is not available|pruned/i.test(JSON.stringify((error as any)?.message ?? error ?? ""));
}

function isRateLimitError(error: unknown): boolean {
  return /429|too many requests/i.test(JSON.stringify((error as any)?.message ?? error ?? ""));
}

function assertValidBlockRange(chain: string, fromBlock: any, toBlock: any) {
  if (!Number.isInteger(fromBlock) || !Number.isInteger(toBlock) || fromBlock < 1 || fromBlock > toBlock) {
    throw new Error(`${chain}: invalid block range ${fromBlock}-${toBlock}`);
  }
}

function emptyMetricsAccumulator(): CosmosChainMetricsAccumulator {
  return { activeUsers: 0, transactionCount: 0, totalGasUsed: 0, feesByDenom: {}, users: new Set<string>() };
}

function toPublicMetrics(metrics: CosmosChainMetricsAccumulator): CosmosChainMetrics {
  return {
    activeUsers: metrics.users.size,
    transactionCount: metrics.transactionCount,
    totalGasUsed: metrics.totalGasUsed,
    feesByDenom: metrics.feesByDenom,
  };
}

function getPoolError(errors: any[]) {
  return errors[0]?.raw ?? errors[0];
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
