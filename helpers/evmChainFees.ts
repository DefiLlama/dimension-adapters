import { getProvider, log } from "@defillama/sdk";
import { PromisePool } from "@supercharge/promise-pool";
import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "./chains";
import { getBlock } from "./getBlock";
import { METRIC } from "./metrics";

type RpcSender = {
  url?: string;
  send: (method: string, params: any[]) => Promise<any>;
};

type ReceiptLike = {
  from?: string;
  gasUsed?: bigint | number | string | { toString: () => string };
  gasPrice?: bigint | number | string | { toString: () => string };
  effectiveGasPrice?: bigint | number | string | { toString: () => string };
  hash?: string;
  type?: bigint | number | string | { toString: () => string };
  transactionHash?: string;
};

type TransactionLike = {
  from?: string;
  gasPrice?: bigint | number | string | { toString: () => string };
  hash?: string;
  maxFeePerGas?: bigint | number | string | { toString: () => string };
  maxPriorityFeePerGas?: bigint | number | string | { toString: () => string };
  type?: bigint | number | string | { toString: () => string };
};

type ProviderLike = {
  getTransaction: (txHash: string) => Promise<any>;
  getTransactionReceipt: (txHash: string) => Promise<any>;
  rpcs?: Array<{ provider?: RpcSender; url?: string }>;
  send?: (method: string, params: any[]) => Promise<any>;
};

export type EvmChainMetrics = {
  activeUsers: number;
  transactionCount: number;
  totalFeesWei: bigint;
  totalGasUsed: bigint;
};

type EvmChainMetricsAccumulator = EvmChainMetrics & {
  users: Set<string>;
};

export type EvmChainMetricConfig = {
  chain: string;
  start?: string | number;
  blockChunkSize?: number;
  blockConcurrency?: number;
  provider?: ProviderLike;
  rpcSenders?: RpcSender[];
  txReceiptConcurrency?: number;
  rpcTimeoutMs?: number;
  batchConcurrency?: number;
};

export type EvmChainFeesConfig = EvmChainMetricConfig & {
  revenueShare: number;
  supplySideRevenueShare?: number;
};

type BlockRange = {
  fromBlock: number;
  toBlock: number;
};

const BLOCK_RECEIPTS_METHOD = "eth_getBlockReceipts";
const CHAIN_REVENUE_LABEL = "Transaction Gas Fees To Chain";
const SUPPLY_SIDE_REVENUE_LABEL = "Transaction Gas Fees To Supply Side";
const DEFAULT_BLOCK_CHUNK_SIZE = 500;
const DEFAULT_BLOCK_CONCURRENCY = 8;
const DEFAULT_TX_RECEIPT_CONCURRENCY = 20;
const DEFAULT_RPC_TIMEOUT_MS = 10_000;
const DEFAULT_SINGLE_RPC_ATTEMPTS = 2;
const DEFAULT_BATCH_CONCURRENCY = 2;
const DEFAULT_RPC_BATCH_SIZE = 100;
const SHARE_PRECISION = 1_000_000n;
const blockReceiptsSupport: Record<string, boolean | undefined> = {};
const preferredRpcSender: Record<string, string | undefined> = {};
const failedRpcSenders: Record<string, Set<string> | undefined> = {};

/**
 * Shared configs for EVM chains that can derive chain metrics directly from RPC receipts.
 * Add a chain here when both fees and active-users should use the same block range calculation.
 */
export const EVM_CHAIN_METRIC_CONFIGS: Record<string, EvmChainFeesConfig> = {
  core: { chain: CHAIN.CORE, start: "2023-04-19", blockChunkSize: 500, revenueShare: 1 },
  kava: { chain: CHAIN.KAVA, start: "2022-05-10", blockChunkSize: 100, revenueShare: 1 },
  merlin: { chain: CHAIN.MERLIN, start: "2024-04-01", blockChunkSize: 250, rpcTimeoutMs: 20_000, revenueShare: 1 },
};

const baseMethodology = {
  Fees: "Transaction gas fees paid by users.",
  Revenue: "Configured share of transaction gas fees retained by the chain.",
};

const baseBreakdownMethodology = {
  Fees: {
    [METRIC.TRANSACTION_GAS_FEES]: "Sum of gasUsed multiplied by effectiveGasPrice, or legacy gasPrice when effectiveGasPrice is unavailable, across all receipts in the day window.",
  },
  Revenue: {
    [CHAIN_REVENUE_LABEL]: "Configured share of transaction gas fees retained by the chain.",
  },
};

/**
 * Splits an inclusive block range into deterministic chunks for batch RPC processing.
 */
export function makeBlockChunks(fromBlock: number, toBlock: number, chunkSize = DEFAULT_BLOCK_CHUNK_SIZE): BlockRange[] {
  if (!Number.isFinite(fromBlock) || !Number.isFinite(toBlock)) return [];
  if (fromBlock > toBlock) return [];
  if (!Number.isFinite(chunkSize) || !Number.isInteger(chunkSize) || chunkSize < 1) {
    throw new Error(`Invalid block chunk size: ${chunkSize}`);
  }

  const chunks: BlockRange[] = [];
  for (let block = fromBlock; block <= toBlock; block += chunkSize) {
    chunks.push({
      fromBlock: block,
      toBlock: Math.min(block + chunkSize - 1, toBlock),
    });
  }
  return chunks;
}

/**
 * Reduces receipts into raw chain metrics without price conversion.
 */
export function getReceiptMetrics(receipts: Array<ReceiptLike | null | undefined>): EvmChainMetrics {
  return toPublicMetrics(getReceiptMetricsAccumulator(receipts));
}

/**
 * Fills missing receipt sender or legacy gas price fields from full transaction objects.
 */
export function hydrateReceiptsWithTransactions(receipts: ReceiptLike[], transactions: TransactionLike[]): ReceiptLike[] {
  const transactionByHash = new Map<string, TransactionLike>();

  for (const tx of transactions) {
    if (tx.hash) transactionByHash.set(tx.hash.toLowerCase(), tx);
  }

  return receipts.map((receipt) => {
    const hash = getReceiptHash(receipt);
    const transaction = hash ? transactionByHash.get(hash.toLowerCase()) : undefined;
    if (!transaction) return receipt;

    return {
      ...receipt,
      from: receipt.from ?? transaction.from,
      gasPrice: receipt.gasPrice ?? receipt.effectiveGasPrice ?? getLegacyTransactionGasPrice(receipt, transaction),
    };
  });
}

/**
 * Aggregates receipt metrics while keeping the user set for later chunk merges.
 */
function getReceiptMetricsAccumulator(receipts: Array<ReceiptLike | null | undefined>): EvmChainMetricsAccumulator {
  const users = new Set<string>();
  let totalFeesWei = 0n;
  let totalGasUsed = 0n;
  let transactionCount = 0;

  for (const receipt of receipts) {
    if (!receipt) continue;
    const gasUsed = toBigInt(receipt.gasUsed, "gasUsed");
    const gasPrice = toBigInt(receipt.effectiveGasPrice ?? receipt.gasPrice, "effectiveGasPrice");

    transactionCount += 1;
    totalGasUsed += gasUsed;
    totalFeesWei += gasUsed * gasPrice;

    if (receipt.from) users.add(receipt.from.toLowerCase());
  }

  return {
    activeUsers: users.size,
    transactionCount,
    totalFeesWei,
    totalGasUsed,
    users,
  };
}

/**
 * Fetches raw EVM chain metrics for an inclusive block range.
 * It prefers batched eth_getBlockReceipts and falls back to block transactions plus transaction receipts.
 */
export async function fetchEvmChainMetrics(config: EvmChainMetricConfig & BlockRange): Promise<EvmChainMetrics> {
  assertValidBlockRange(config.chain, config.fromBlock, config.toBlock);
  const chunks = makeBlockChunks(config.fromBlock, config.toBlock, config.blockChunkSize);
  const totals = emptyMetricsAccumulator();

  const { results, errors } = await PromisePool
    .withConcurrency(config.batchConcurrency ?? DEFAULT_BATCH_CONCURRENCY)
    .for(chunks)
    .process(async (chunk) => {
      const receipts = await getBlockRangeReceipts(config, chunk);
      return getReceiptMetricsAccumulator(receipts);
    });

  if (errors.length) throw getPoolError(errors);
  results.forEach((metrics) => mergeMetrics(totals, metrics));

  return toPublicMetrics(totals);
}

/**
 * Retrieves all receipts for a block chunk using the fastest safe RPC path.
 */
async function getBlockRangeReceipts(config: EvmChainMetricConfig, chunk: BlockRange): Promise<ReceiptLike[]> {
  const blocks: number[] = [];
  for (let block = chunk.fromBlock; block <= chunk.toBlock; block++) blocks.push(block);

  if (hasAvailableBlockReceiptsSender(config)) {
    try {
      const blockReceipts = await getBatchBlockReceipts(config, blocks);
      return hydrateReceiptsBatchIfNeeded(config, blockReceipts.flat());
    } catch (error) {
      if (isMethodUnavailable(error)) {
        log(`${config.chain}: ${BLOCK_RECEIPTS_METHOD} unavailable on configured RPC senders, falling back to transaction receipts`);
      } else {
        return getBlockReceiptsIndividually(config, blocks);
      }
    }
  }

  return getTransactionReceiptsFallbackForBlocks(config, blocks);
}

/**
 * Falls back to per-block receipt loading when an RPC supports single calls but rejects a batch.
 */
async function getBlockReceiptsIndividually(config: EvmChainMetricConfig, blocks: number[]): Promise<ReceiptLike[]> {
  const { results, errors } = await PromisePool
    .withConcurrency(config.blockConcurrency ?? DEFAULT_BLOCK_CONCURRENCY)
    .for(blocks)
    .process((block) => getBlockReceipts(config, block));

  if (errors.length) throw getPoolError(errors);
  return results.flat();
}

/**
 * Loads a chunk of block receipts using a single JSON-RPC batch request.
 */
async function getBatchBlockReceipts(config: EvmChainMetricConfig, blocks: number[]): Promise<ReceiptLike[][]> {
  const receipts = await sendFirstRpcBatch(config, BLOCK_RECEIPTS_METHOD, blocks.map((block) => [toHex(block)]));
  if (!receipts.every(Array.isArray)) {
    throw new Error(`${config.chain}: ${BLOCK_RECEIPTS_METHOD} returned invalid batch results`);
  }
  return receipts as ReceiptLike[][];
}

/**
 * Loads receipts through block transaction hashes when eth_getBlockReceipts is unavailable.
 */
async function getTransactionReceiptsFallbackForBlocks(config: EvmChainMetricConfig, blocks: number[]): Promise<ReceiptLike[]> {
  const hashesByBlock = await getBlockTransactionHashesBatch(config, blocks);
  const hashes = hashesByBlock.flat();

  if (!hashes.length) return [];

  const receipts = await sendRpcBatchInChunks(
    config,
    "eth_getTransactionReceipt",
    hashes.map((txHash) => [txHash]),
    DEFAULT_RPC_BATCH_SIZE,
  );
  const nonNullReceipts = receipts.filter(Boolean) as ReceiptLike[];

  if (nonNullReceipts.length !== hashes.length) {
    throw new Error(`${config.chain}: missing ${hashes.length - nonNullReceipts.length} receipts for block range ${blocks[0]}-${blocks[blocks.length - 1]}`);
  }

  return hydrateReceiptsBatchIfNeeded(config, nonNullReceipts);
}

/**
 * Fetches transaction hashes for each block in a chunk through batched eth_getBlockByNumber calls.
 */
async function getBlockTransactionHashesBatch(config: EvmChainMetricConfig, blocks: number[]): Promise<string[][]> {
  const rpcBlocks = await sendFirstRpcBatch(config, "eth_getBlockByNumber", blocks.map((block) => [toHex(block), false]));
  return rpcBlocks.map((rpcBlock, index) => getBlockTransactionHashesFromBlock(config, blocks[index], rpcBlock));
}

/**
 * Hydrates missing sender or fee-price receipt fields using batched transaction lookups.
 */
async function hydrateReceiptsBatchIfNeeded(config: EvmChainMetricConfig, receipts: ReceiptLike[]): Promise<ReceiptLike[]> {
  if (receipts.every((receipt) => receipt?.from && hasFeePrice(receipt))) return receipts;

  const txHashes = receipts
    .filter(needsTransactionData)
    .map(getReceiptHash)
    .filter(Boolean) as string[];

  if (!txHashes.length) return receipts;

  const transactions = await sendRpcBatchInChunks(
    config,
    "eth_getTransactionByHash",
    [...new Set(txHashes)].map((txHash) => [txHash]),
    DEFAULT_RPC_BATCH_SIZE,
  );

  return hydrateReceiptsWithTransactions(receipts, transactions.filter(Boolean) as TransactionLike[]);
}

/**
 * Resolves the adapter timestamp window to blocks and fetches raw chain metrics.
 */
export async function fetchEvmChainMetricsFromOptions(options: FetchOptions, config: EvmChainMetricConfig): Promise<EvmChainMetrics> {
  const [fromBlock, toBlock] = await Promise.all([options.getFromBlock(), options.getToBlock()]);
  assertValidBlockRange(config.chain, fromBlock, toBlock);
  return fetchEvmChainMetrics({ ...config, fromBlock, toBlock });
}

/**
 * Creates a chain protocol fees adapter backed by raw RPC receipt metrics.
 */
export function createEvmChainFeesAdapter(config: EvmChainFeesConfig): SimpleAdapter {
  assertValidRevenueAllocation(config);

  return {
    version: 2,
    protocolType: ProtocolType.CHAIN,
    isExpensiveAdapter: true,
    chains: [config.chain],
    start: config.start,
    methodology: getMethodology(config),
    breakdownMethodology: getBreakdownMethodology(config),
    fetch: async (options: FetchOptions) => {
      const metrics = await fetchEvmChainMetricsFromOptions(options, config);
      const dailyFees = options.createBalances();
      const dailyRevenue = options.createBalances();

      dailyFees.addGasToken(metrics.totalFeesWei, METRIC.TRANSACTION_GAS_FEES);
      addGasFeeShare(dailyRevenue, metrics.totalFeesWei, config.revenueShare, CHAIN_REVENUE_LABEL);
      const response: Record<string, any> = {
        dailyFees,
        dailyRevenue,
        dailyTransactionsCount: metrics.transactionCount,
        dailyGasUsed: metrics.totalGasUsed.toString(),
      };

      if (isPositiveShare(config.supplySideRevenueShare)) {
        const dailySupplySideRevenue = options.createBalances();
        addGasFeeShare(dailySupplySideRevenue, metrics.totalFeesWei, config.supplySideRevenueShare, SUPPLY_SIDE_REVENUE_LABEL);
        response.dailySupplySideRevenue = dailySupplySideRevenue;
      }

      return response;
    },
  };
}

function getMethodology(config: EvmChainFeesConfig) {
  const methodology: Record<string, string> = { ...baseMethodology };

  if (isPositiveShare(config.supplySideRevenueShare)) {
    methodology.SupplySideRevenue = `Configured ${formatShare(config.supplySideRevenueShare)} share of transaction gas fees paid to supply-side participants.`;
  }

  return methodology;
}

function getBreakdownMethodology(config: EvmChainFeesConfig) {
  const breakdownMethodology: Record<string, Record<string, string>> = {
    Fees: { ...baseBreakdownMethodology.Fees },
    Revenue: { ...baseBreakdownMethodology.Revenue },
  };

  if (isPositiveShare(config.supplySideRevenueShare)) {
    breakdownMethodology.SupplySideRevenue = {
      [SUPPLY_SIDE_REVENUE_LABEL]: "Configured share of transaction gas fees paid to supply-side participants.",
    };
  }

  return breakdownMethodology;
}

function formatShare(share: number) {
  return `${Number((share * 100).toFixed(4))}%`;
}

function addGasFeeShare(balances: ReturnType<FetchOptions["createBalances"]>, totalFeesWei: bigint, share: number, label: string) {
  balances.addGasToken(applyShare(totalFeesWei, share), label);
}

function applyShare(amount: bigint, share: number) {
  return amount * toShareUnits(share) / SHARE_PRECISION;
}

function toShareUnits(share: number) {
  return BigInt(Math.round(share * Number(SHARE_PRECISION)));
}

function isPositiveShare(share: number | undefined): share is number {
  return share !== undefined && toShareUnits(share) > 0n;
}

/**
 * Creates an active-users fetcher that reuses the same receipt metrics as the fees adapter.
 */
export function createEvmChainUsersFetcher(config: EvmChainMetricConfig) {
  return async (startTimestamp: number, endTimestamp: number) => {
    const [fromBlock, toBlock] = await Promise.all([
      getBlock(startTimestamp, config.chain),
      getBlock(endTimestamp - 1, config.chain),
    ]);

    assertValidBlockRange(config.chain, fromBlock, toBlock);

    const metrics = await fetchEvmChainMetrics({ ...config, fromBlock, toBlock });
    return [{
      usercount: metrics.activeUsers,
      txcount: metrics.transactionCount,
      gas: metrics.totalGasUsed.toString(),
    }];
  };
}

/**
 * Loads receipts for a single block with block-receipt support detection.
 */
async function getBlockReceipts(config: EvmChainMetricConfig, block: number): Promise<ReceiptLike[]> {
  const blockHex = toHex(block);

  if (hasAvailableBlockReceiptsSender(config)) {
    try {
      const receipts = await sendFirstRpc(config, BLOCK_RECEIPTS_METHOD, [blockHex]);
      if (Array.isArray(receipts)) {
        return hydrateReceiptsIfNeeded(config, block, receipts);
      }
    } catch (error) {
      if (isMethodUnavailable(error)) {
        log(`${config.chain}: ${BLOCK_RECEIPTS_METHOD} unavailable on configured RPC senders, falling back to transaction receipts`);
      }
    }
  }

  return getTransactionReceiptsFallback(config, block);
}

/**
 * Single-block fallback used when batched paths cannot be used for a block.
 */
async function getTransactionReceiptsFallback(config: EvmChainMetricConfig, block: number): Promise<ReceiptLike[]> {
  const hashes = await getBlockTransactionHashes(config, block);

  if (!hashes.length) return [];

  const { results, errors } = await PromisePool
    .withConcurrency(config.txReceiptConcurrency ?? DEFAULT_TX_RECEIPT_CONCURRENCY)
    .for(hashes)
    .process((txHash) => getTransactionReceipt(config, txHash));

  if (errors.length) throw getPoolError(errors);
  const receipts = results.filter(Boolean) as ReceiptLike[];
  if (receipts.length !== hashes.length) {
    throw new Error(`${config.chain}: missing ${hashes.length - receipts.length} receipts for block ${block}`);
  }
  return hydrateReceiptsIfNeeded(config, block, receipts);
}

/**
 * Reads transaction hashes from one block without hydrating full transactions.
 */
async function getBlockTransactionHashes(config: EvmChainMetricConfig, block: number): Promise<string[]> {
  const rpcBlock = await sendFirstRpc(config, "eth_getBlockByNumber", [toHex(block), false]);
  return getBlockTransactionHashesFromBlock(config, block, rpcBlock);
}

/**
 * Extracts transaction hashes from a validated eth_getBlockByNumber payload.
 */
function getBlockTransactionHashesFromBlock(config: EvmChainMetricConfig, block: number, rpcBlock: any): string[] {
  return getBlockTransactions(config, block, rpcBlock)
    .map((tx: string | TransactionLike) => typeof tx === "string" ? tx : tx.hash)
    .filter((hash): hash is string => Boolean(hash));
}

/**
 * Hydrates receipts for a single block when the receipt payload is missing sender or fee price.
 */
async function hydrateReceiptsIfNeeded(config: EvmChainMetricConfig, block: number, receipts: ReceiptLike[]): Promise<ReceiptLike[]> {
  if (receipts.every((receipt) => receipt?.from && hasFeePrice(receipt))) return receipts;
  const rpcBlock = await sendFirstRpc(config, "eth_getBlockByNumber", [toHex(block), true]);
  const hydratedReceipts = hydrateReceiptsWithTransactions(
    receipts,
    getBlockTransactions(config, block, rpcBlock).filter((tx: string | TransactionLike) => typeof tx !== "string"),
  );

  const missingTxHashes = hydratedReceipts
    .filter(needsTransactionData)
    .map(getReceiptHash)
    .filter(Boolean) as string[];

  if (!missingTxHashes.length) return hydratedReceipts;

  const { results, errors } = await PromisePool
    .withConcurrency(config.txReceiptConcurrency ?? DEFAULT_TX_RECEIPT_CONCURRENCY)
    .for([...new Set(missingTxHashes)])
    .process((txHash) => getTransaction(config, txHash));

  if (errors.length) throw getPoolError(errors);

  return hydrateReceiptsWithTransactions(
    hydratedReceipts,
    results.filter(Boolean) as TransactionLike[],
  );
}

/**
 * Validates block payloads so RPC lag or malformed responses cannot undercount data.
 */
function getBlockTransactions(config: EvmChainMetricConfig, block: number, rpcBlock: any): Array<string | TransactionLike> {
  if (!rpcBlock || !Array.isArray(rpcBlock.transactions)) {
    throw new Error(`${config.chain}: eth_getBlockByNumber returned an invalid block payload for block ${block} (${toHex(block)})`);
  }
  return rpcBlock.transactions;
}

/**
 * Fetches one transaction receipt with provider retries before falling back to raw RPC senders.
 */
async function getTransactionReceipt(config: EvmChainMetricConfig, txHash: string): Promise<ReceiptLike | null> {
  const provider = getMetricProvider(config);

  for (let attempt = 0; attempt < 3; attempt++) {
    const receipt = await withTimeout(
      provider.getTransactionReceipt(txHash),
      config.rpcTimeoutMs ?? DEFAULT_RPC_TIMEOUT_MS,
      `${config.chain} getTransactionReceipt`,
    ).catch((error) => {
      if (attempt === 2) logRpcFailure(config, "getTransactionReceipt", txHash, error, `attempt ${attempt + 1}`);
      return null;
    });
    if (receipt) return receipt as ReceiptLike;
    await sleep(250 * (attempt + 1));
  }

  for (const [index, sender] of getRpcSenders(config).entries()) {
    const receipt = await withTimeout(
      sender.send("eth_getTransactionReceipt", [txHash]),
      config.rpcTimeoutMs ?? DEFAULT_RPC_TIMEOUT_MS,
      `${config.chain} eth_getTransactionReceipt`,
    ).catch((error) => {
      logRpcFailure(config, "eth_getTransactionReceipt", txHash, error, sender.url ?? `sender:${index}`);
      return null;
    });
    if (receipt) return receipt as ReceiptLike;
  }

  return null;
}

/**
 * Fetches one transaction with provider retries before falling back to raw RPC senders.
 */
async function getTransaction(config: EvmChainMetricConfig, txHash: string): Promise<TransactionLike | null> {
  const provider = getMetricProvider(config);

  for (let attempt = 0; attempt < 3; attempt++) {
    const transaction = await withTimeout(
      provider.getTransaction(txHash),
      config.rpcTimeoutMs ?? DEFAULT_RPC_TIMEOUT_MS,
      `${config.chain} getTransaction`,
    ).catch((error) => {
      if (attempt === 2) logRpcFailure(config, "getTransaction", txHash, error, `attempt ${attempt + 1}`);
      return null;
    });
    if (transaction) return transaction as TransactionLike;
    await sleep(250 * (attempt + 1));
  }

  for (const [index, sender] of getRpcSenders(config).entries()) {
    const transaction = await withTimeout(
      sender.send("eth_getTransactionByHash", [txHash]),
      config.rpcTimeoutMs ?? DEFAULT_RPC_TIMEOUT_MS,
      `${config.chain} eth_getTransactionByHash`,
    ).catch((error) => {
      logRpcFailure(config, "eth_getTransactionByHash", txHash, error, sender.url ?? `sender:${index}`);
      return null;
    });
    if (transaction) return transaction as TransactionLike;
  }

  return null;
}

/**
 * Sends a single RPC call through healthy senders, preferring the last successful endpoint.
 */
async function sendFirstRpc(config: EvmChainMetricConfig, method: string, params: any[]) {
  const senders = getOrderedRpcSenders(config, method);
  let lastError: any;
  let methodUnavailableError: any;
  let nonMethodUnavailableError: any;

  for (const { sender, key } of senders) {
    let senderError: any;

    for (let attempt = 0; attempt < DEFAULT_SINGLE_RPC_ATTEMPTS; attempt++) {
      try {
        const result = await withTimeout(
          sender.send(method, params),
          config.rpcTimeoutMs ?? DEFAULT_RPC_TIMEOUT_MS,
          `${config.chain} ${method}`,
        );
        markRpcSenderSuccess(config, method, key);
        return result;
      } catch (error) {
        senderError = error;
        lastError = error;
        if (isMethodUnavailable(error)) {
          methodUnavailableError ??= error;
          break;
        }
        nonMethodUnavailableError ??= error;
        if (attempt < DEFAULT_SINGLE_RPC_ATTEMPTS - 1) await sleep(250 * (attempt + 1));
      }
    }
    markRpcSenderFailure(config, method, key, senderError);
  }

  throw nonMethodUnavailableError ?? methodUnavailableError ?? lastError ?? new Error(`No RPC sender available for ${config.chain}`);
}

/**
 * Sends one JSON-RPC batch through healthy URL-backed senders.
 */
async function sendFirstRpcBatch(config: EvmChainMetricConfig, method: string, paramsList: any[][]): Promise<any[]> {
  if (!paramsList.length) return [];

  const batchSenders = getOrderedRpcSenders(config, method, true);
  let lastError: any;
  let methodUnavailableError: any;
  let nonMethodUnavailableError: any;

  for (const { sender, key } of batchSenders) {
    try {
      const result = await sendHttpRpcBatch(config, sender, method, paramsList);
      markRpcSenderSuccess(config, method, key);
      return result;
    } catch (error) {
      lastError = error;
      if (isMethodUnavailable(error)) {
        methodUnavailableError ??= error;
      } else {
        nonMethodUnavailableError ??= error;
      }
      markRpcSenderFailure(config, method, key, error);
    }
  }

  try {
    return await sendRpcBatchViaSingleCalls(config, method, paramsList);
  } catch (error) {
    lastError = error;
  }

  throw nonMethodUnavailableError ?? methodUnavailableError ?? lastError ?? new Error(`No batch JSON-RPC sender available for ${config.chain}`);
}

/**
 * Splits large batch inputs into endpoint-friendly chunks.
 */
async function sendRpcBatchInChunks(config: EvmChainMetricConfig, method: string, paramsList: any[][], chunkSize: number): Promise<any[]> {
  const chunks: any[][][] = [];
  for (let i = 0; i < paramsList.length; i += chunkSize) {
    chunks.push(paramsList.slice(i, i + chunkSize));
  }

  const results: any[] = [];
  for (const chunk of chunks) {
    results.push(...await sendFirstRpcBatch(config, method, chunk));
  }
  return results;
}

/**
 * Executes batch-shaped work through individual RPC calls when no batch URL is available.
 */
async function sendRpcBatchViaSingleCalls(config: EvmChainMetricConfig, method: string, paramsList: any[][]): Promise<any[]> {
  const { results, errors } = await PromisePool
    .withConcurrency(config.blockConcurrency ?? DEFAULT_BLOCK_CONCURRENCY)
    .for(paramsList)
    .process((params) => sendFirstRpc(config, method, params));

  if (errors.length) throw getPoolError(errors);
  return results;
}

/**
 * Posts a JSON-RPC batch and returns results ordered to match the original request list.
 */
async function sendHttpRpcBatch(config: EvmChainMetricConfig, sender: RpcSender, method: string, paramsList: any[][]): Promise<any[]> {
  if (!sender.url) throw new Error(`No batch JSON-RPC URL available for ${config.chain}`);

  const requests = paramsList.map((params, index) => ({
    jsonrpc: "2.0",
    id: index + 1,
    method,
    params,
  }));
  const payload = await postJsonRpcBatch(sender.url, requests, config.rpcTimeoutMs ?? DEFAULT_RPC_TIMEOUT_MS, `${config.chain} ${method}`);

  if (!Array.isArray(payload)) {
    throw createRpcBatchError(sender.url, method, payload?.error ?? payload);
  }

  const responseById = new Map<number, any>();
  for (const item of payload) responseById.set(Number(item.id), item);

  return requests.map((request) => {
    const response = responseById.get(request.id);
    if (!response) throw new Error(`${config.chain}: ${method} batch response missing id ${request.id}`);
    if (response.error) throw createRpcBatchError(sender.url!, method, response.error);
    return response.result;
  });
}

/**
 * Sends the HTTP request for a JSON-RPC batch with timeout and JSON validation.
 */
async function postJsonRpcBatch(url: string, requests: any[], timeoutMs: number, label: string): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requests),
      signal: controller.signal,
    });
    const text = await response.text();
    let payload: any;

    try {
      payload = JSON.parse(text);
    } catch (error) {
      throw new Error(`${label} returned invalid JSON from ${url}: ${text.slice(0, 120)}`);
    }

    if (!response.ok && !Array.isArray(payload) && !payload?.error) {
      throw new Error(`${label} returned HTTP ${response.status} from ${url}`);
    }

    return payload;
  } catch (error: any) {
    if (error?.name === "AbortError") throw new Error(`${label} timed out after ${timeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Normalizes one failed JSON-RPC batch item into an Error.
 */
function createRpcBatchError(url: string, method: string, error: any) {
  const message = JSON.stringify(error?.error ?? error?.message ?? error);
  const rpcError = new Error(`${method} failed on ${url}: ${message}`);
  (rpcError as any).error = error;
  return rpcError;
}

/**
 * Returns the injected provider for tests or the SDK provider for production runs.
 */
function getMetricProvider(config: EvmChainMetricConfig): ProviderLike {
  return config.provider ?? getProvider(config.chain);
}

/**
 * Collects JSON-RPC senders from explicit config or the SDK provider RPC list.
 */
function getRpcSenders(config: EvmChainMetricConfig): RpcSender[] {
  if (config.rpcSenders?.length) return config.rpcSenders;

  const provider = getMetricProvider(config);
  const senders: RpcSender[] = [];

  if (typeof provider?.send === "function") senders.push({ send: provider.send.bind(provider) });
  for (const rpc of provider?.rpcs ?? []) {
    if (typeof rpc?.provider?.send === "function") senders.push({ url: rpc.url, send: rpc.provider.send.bind(rpc.provider) });
  }

  if (!senders.length) throw new Error(`No JSON-RPC sender available for ${config.chain}`);
  return senders;
}

/**
 * Orders senders by cached health for the specific chain and RPC method.
 */
function getOrderedRpcSenders(config: EvmChainMetricConfig, method: string, requireUrl = false) {
  const senders = getRpcSenders(config)
    .map((sender, index) => ({
      sender,
      key: getRpcSenderKey(config, sender, index),
    }))
    .filter(({ sender }) => !requireUrl || Boolean(sender.url))
    .filter(({ key }) => method !== BLOCK_RECEIPTS_METHOD || blockReceiptsSupport[key] !== false);
  const cacheKey = getRpcMethodCacheKey(config, method);
  const failed = failedRpcSenders[cacheKey];
  let candidates = failed ? senders.filter(({ key }) => !failed.has(key)) : senders;

  if (!candidates.length) candidates = senders;

  const preferred = preferredRpcSender[cacheKey];
  if (!preferred) return candidates;

  return [...candidates].sort((left, right) => Number(right.key === preferred) - Number(left.key === preferred));
}

/**
 * Checks whether any configured sender can still be tried for eth_getBlockReceipts.
 */
function hasAvailableBlockReceiptsSender(config: EvmChainMetricConfig) {
  return getRpcSenders(config)
    .some((sender, index) => blockReceiptsSupport[getRpcSenderKey(config, sender, index)] !== false);
}

/**
 * Creates a stable cache key for one RPC sender.
 */
function getRpcSenderKey(config: EvmChainMetricConfig, sender: RpcSender, index: number) {
  return `${config.chain}:${sender.url ?? `sender:${index}`}`;
}

/**
 * Creates a cache namespace for one chain and RPC method.
 */
function getRpcMethodCacheKey(config: EvmChainMetricConfig, method: string) {
  return `${config.chain}:${method}`;
}

/**
 * Marks a sender as preferred after a successful call.
 */
function markRpcSenderSuccess(config: EvmChainMetricConfig, method: string, key: string) {
  const cacheKey = getRpcMethodCacheKey(config, method);
  preferredRpcSender[cacheKey] = key;
  failedRpcSenders[cacheKey]?.delete(key);
  if (method === BLOCK_RECEIPTS_METHOD) blockReceiptsSupport[key] = true;
}

/**
 * Marks a sender as failed so later calls can avoid repeatedly hitting a bad endpoint.
 */
function markRpcSenderFailure(config: EvmChainMetricConfig, method: string, key: string, error?: any) {
  const cacheKey = getRpcMethodCacheKey(config, method);
  if (preferredRpcSender[cacheKey] === key) delete preferredRpcSender[cacheKey];
  if (!failedRpcSenders[cacheKey]) failedRpcSenders[cacheKey] = new Set<string>();
  failedRpcSenders[cacheKey]?.add(key);
  if (method === BLOCK_RECEIPTS_METHOD && isMethodUnavailable(error)) blockReceiptsSupport[key] = false;
}

/**
 * Extracts the original error from PromisePool wrapper errors.
 */
function getPoolError(errors: any[]) {
  return errors[0]?.raw ?? errors[0];
}

/**
 * Creates an empty mutable metrics accumulator.
 */
function emptyMetricsAccumulator(): EvmChainMetricsAccumulator {
  return {
    activeUsers: 0,
    transactionCount: 0,
    totalFeesWei: 0n,
    totalGasUsed: 0n,
    users: new Set<string>(),
  };
}

/**
 * Merges one chunk accumulator into the full block-range accumulator.
 */
function mergeMetrics(target: EvmChainMetricsAccumulator, source: EvmChainMetricsAccumulator) {
  source.users.forEach((user) => target.users.add(user));
  target.activeUsers = target.users.size;
  target.transactionCount += source.transactionCount;
  target.totalFeesWei += source.totalFeesWei;
  target.totalGasUsed += source.totalGasUsed;
}

/**
 * Removes internal accumulator state before returning public metrics.
 */
function toPublicMetrics(metrics: EvmChainMetricsAccumulator): EvmChainMetrics {
  return {
    activeUsers: metrics.users.size,
    transactionCount: metrics.transactionCount,
    totalFeesWei: metrics.totalFeesWei,
    totalGasUsed: metrics.totalGasUsed,
  };
}

/**
 * Ensures timestamp-to-block resolution produced a usable inclusive block range.
 */
function assertValidBlockRange(chain: string, fromBlock: any, toBlock: any) {
  if (!isValidBlockNumber(fromBlock) || !isValidBlockNumber(toBlock) || fromBlock > toBlock) {
    throw new Error(`${chain}: invalid block range ${fromBlock}-${toBlock}`);
  }
}

function isValidBlockNumber(block: any) {
  return Number.isInteger(block) && block >= 0;
}

/**
 * Ensures chain fee allocation is explicit and bounded.
 */
function assertValidRevenueAllocation(config: EvmChainFeesConfig) {
  if (!Number.isFinite(config.revenueShare) || config.revenueShare < 0 || config.revenueShare > 1) {
    throw new Error(`${config.chain}: revenueShare must be a number between 0 and 1`);
  }
  if (config.supplySideRevenueShare !== undefined && (!Number.isFinite(config.supplySideRevenueShare) || config.supplySideRevenueShare < 0 || config.supplySideRevenueShare > 1)) {
    throw new Error(`${config.chain}: supplySideRevenueShare must be a number between 0 and 1`);
  }
  if (toShareUnits(config.revenueShare) + toShareUnits(config.supplySideRevenueShare ?? 0) > SHARE_PRECISION) {
    throw new Error(`${config.chain}: revenueShare and supplySideRevenueShare cannot exceed 1`);
  }
}

/**
 * Returns the hash field used by either raw JSON-RPC or provider receipt shapes.
 */
function getReceiptHash(receipt: ReceiptLike): string | undefined {
  return receipt.transactionHash ?? receipt.hash;
}

/**
 * Checks whether a receipt already has enough fee data to compute gas fees.
 */
function hasFeePrice(receipt: ReceiptLike): boolean {
  return receipt.effectiveGasPrice !== undefined || receipt.gasPrice !== undefined;
}

/**
 * Returns legacy transaction gasPrice only when the transaction is not EIP-1559.
 */
function getLegacyTransactionGasPrice(receipt: ReceiptLike, transaction: TransactionLike) {
  if (transaction.gasPrice === undefined) return undefined;
  if (transaction.maxFeePerGas !== undefined || transaction.maxPriorityFeePerGas !== undefined) return undefined;
  if (isEip1559Type(receipt.type) || isEip1559Type(transaction.type)) return undefined;
  return transaction.gasPrice;
}

/**
 * Checks whether receipt hydration needs transaction data.
 */
function needsTransactionData(receipt: ReceiptLike): boolean {
  return !receipt.from || !hasFeePrice(receipt);
}

/**
 * Detects EIP-1559 transaction type values from provider or raw RPC shapes.
 */
function isEip1559Type(value: ReceiptLike["type"]): boolean {
  if (value === undefined || value === null) return false;
  const normalized = value.toString().toLowerCase();
  return normalized === "2" || normalized === "0x2";
}

/**
 * Detects whether an RPC error means eth_getBlockReceipts is unsupported.
 */
function isMethodUnavailable(error: any) {
  const raw = error?.raw ?? error;
  const message = JSON.stringify([
    raw?.message,
    raw?.info?.error,
    raw?.error,
    raw,
  ]).toLowerCase();
  return message.includes("eth_getblockreceipts")
    && (message.includes("not available")
      || message.includes("does not exist")
      || message.includes("method not found")
      || message.includes("unsupported")
      || message.includes("-32601"));
}

/**
 * Converts hex, decimal, number, bigint, and BigNumber-like values to bigint.
 */
function toBigInt(value: ReceiptLike["gasUsed"], field: string): bigint {
  if (value === undefined || value === null) throw new Error(`Receipt is missing ${field}`);
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  if (typeof value === "string") return BigInt(value);
  return BigInt(value.toString());
}

/**
 * Converts a block number to a JSON-RPC hex quantity.
 */
function toHex(block: number) {
  return `0x${block.toString(16)}`;
}

/**
 * Races an RPC promise against a timeout without changing the underlying call.
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/**
 * Delays retry loops with a small backoff.
 */
async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Logs single-call fallback failures without changing retry behavior.
 */
function logRpcFailure(config: EvmChainMetricConfig, method: string, txHash: string, error: any, context: string) {
  log(`${config.chain}: ${method} failed for ${txHash} (${context}): ${formatRpcError(error)}`);
}

/**
 * Formats RPC errors into a compact log message.
 */
function formatRpcError(error: any) {
  return error?.message ?? JSON.stringify(error?.info?.error ?? error?.error ?? error);
}
