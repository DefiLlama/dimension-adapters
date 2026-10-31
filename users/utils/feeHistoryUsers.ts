import { getProvider } from "@defillama/sdk";
import { PromisePool } from "@supercharge/promise-pool";
import { CHAIN } from "../../helpers/chains";
import { getBlock } from "../../helpers/getBlock";
import { sleep } from "../../utils/utils";

// For OP Stack chains with fast blocks where almost every block holds only the L1-info deposit
// (Matchain: 250ms blocks, ~345k a day, ~100 users). Reading receipts for every block is too heavy
// for the public RPC, so blocks are screened with eth_feeHistory (gasUsedRatio for 1024 blocks per
// call) and receipts are read only for blocks whose gas shows a tx besides the L1-info deposit.
// Counts follow the Blockscout stats definitions these chains used before: every tx including the
// L1-info deposits, every distinct sender including the deposit account, new users = senders of a
// nonce-0 tx.

type ChainConfig = {
  chain: string;
  start?: string;
};

const feeHistoryUsersChains: Record<string, ChainConfig> = {
  matchain: { chain: CHAIN.MATCHAIN }, // moved from blockscoutStats: matchscan.io replaced Blockscout with a lite explorer that has no stats API (Oct 2026)
};

const L1_INFO_DEPOSITOR = "0xdeaddeaddeaddeaddeaddeaddeaddeaddead0001";
const FEE_HISTORY_MAX_BLOCKS = 1024;
// The L1-info deposit uses 43,803-52,239 gas on Matchain and any other tx costs at least 21,000,
// so half the intrinsic gas above the day's minimum separates the two with room on both sides.
const USER_TX_GAS_MARGIN = 10_500;
const BATCH_SIZE = 25; // thirdweb keyless caps batches at 25 calls, rpc.matchain.io rejects 100
const CONCURRENCY = 1; // rpc.matchain.io serves ~28 calls/s whatever the concurrency, parallel batches only add 429s

const preferredRpc: Record<string, string> = {};

async function postBatch(url: string, method: string, paramsList: any[][]) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(paramsList.map((params, id) => ({ jsonrpc: "2.0", id, method, params }))),
  });
  const payload = await response.json();
  if (!Array.isArray(payload)) throw new Error(`${method} batch failed on ${url}: ${JSON.stringify(payload?.error ?? payload)}`);
  const byId = new Map(payload.map((item: any) => [Number(item.id), item]));
  return paramsList.map((params, id) => {
    const item: any = byId.get(id);
    if (item?.result == null) throw new Error(`${method} ${JSON.stringify(params)} failed on ${url}: ${JSON.stringify(item?.error ?? "null result")}`);
    return item.result;
  });
}

// Sends the calls as JSON-RPC batches, retrying each batch across the chain's RPCs.
async function rpcBatch(chain: string, method: string, paramsList: any[][]): Promise<any[]> {
  const rpcs: string[] = (getProvider(chain) as any).rpcs.map((rpc: any) => rpc.url);
  const batches: any[][][] = [];
  for (let i = 0; i < paramsList.length; i += BATCH_SIZE) batches.push(paramsList.slice(i, i + BATCH_SIZE));

  const { results, errors } = await PromisePool.withConcurrency(CONCURRENCY).for(batches).useCorrespondingResults().process(async (batch) => {
    // keyless RPCs (thirdweb) reject most calls of a run, so stay on the last one that answered
    const ordered = [...rpcs].sort((a, b) => Number(b === preferredRpc[chain]) - Number(a === preferredRpc[chain]));
    let lastError: any;
    for (let attempt = 0; attempt < 8; attempt++) {
      for (const url of ordered) {
        try {
          const result = await postBatch(url, method, batch);
          preferredRpc[chain] = url;
          return result;
        } catch (e) {
          lastError = e;
        }
      }
      await sleep(1000 * (attempt + 1)); // public RPCs rate limit bursts
    }
    throw lastError;
  });
  if (errors.length) throw errors[0].raw ?? errors[0];
  return (results as any[][]).flat();
}

async function getBlockRange(chain: string, start: number, end: number) {
  const [fromBlock, toBlock] = await Promise.all([getBlock(start, chain), getBlock(end - 1, chain)]);
  if (!Number.isInteger(fromBlock) || !Number.isInteger(toBlock) || fromBlock >= toBlock)
    throw new Error(`${chain}: invalid block range ${fromBlock}-${toBlock}`);
  return { fromBlock: fromBlock + 1, toBlock };
}

// Returns the blocks in the inclusive range that contain a tx besides the L1-info deposit.
async function getUserTxBlocks(chain: string, fromBlock: number, toBlock: number) {
  const [first, last] = await rpcBatch(chain, "eth_getBlockByNumber", [[toHex(fromBlock), false], [toHex(toBlock), false]]);
  const gasLimit = Number(first.gasLimit);
  if (gasLimit !== Number(last.gasLimit)) throw new Error(`${chain}: gas limit changed between blocks ${fromBlock} and ${toBlock}`);

  const windows: { newest: number; count: number }[] = [];
  for (let newest = toBlock; newest >= fromBlock; newest -= FEE_HISTORY_MAX_BLOCKS)
    windows.push({ newest, count: Math.min(FEE_HISTORY_MAX_BLOCKS, newest - fromBlock + 1) });

  const feeHistories = await rpcBatch(chain, "eth_feeHistory", windows.map(({ newest, count }) => [toHex(count), toHex(newest), []]));
  const blocks = feeHistories.flatMap(({ oldestBlock, gasUsedRatio }, i) => {
    const { newest, count } = windows[i];
    if (Number(oldestBlock) !== newest - count + 1 || gasUsedRatio?.length !== count)
      throw new Error(`${chain}: eth_feeHistory returned an incomplete window ending at block ${newest}`);
    return gasUsedRatio.map((ratio: number, j: number) => ({ block: newest - count + 1 + j, gasUsed: Math.round(ratio * gasLimit) }));
  });

  const minGasUsed = blocks.reduce((min, { gasUsed }) => Math.min(min, gasUsed), Infinity);
  return blocks.filter(({ gasUsed }) => gasUsed >= minGasUsed + USER_TX_GAS_MARGIN).map(({ block }) => block);
}

function getFeeHistoryUsers(config: ChainConfig) {
  return async (start: number, end: number) => {
    const { fromBlock, toBlock } = await getBlockRange(config.chain, start, end);
    const userTxBlocks = await getUserTxBlocks(config.chain, fromBlock, toBlock);
    const receiptsByBlock = await rpcBatch(config.chain, "eth_getBlockReceipts", userTxBlocks.map((block) => [toHex(block)]));

    const users = new Set<string>([L1_INFO_DEPOSITOR]);
    let txcount = toBlock - fromBlock + 1; // one L1-info deposit per block
    for (const receipts of receiptsByBlock) {
      txcount += receipts.length - 1;
      receipts.forEach((receipt: any) => users.add(receipt.from.toLowerCase()));
    }

    return [{
      usercount: users.size,
      txcount,
    }];
  };
}

function getFeeHistoryNewUsers(config: ChainConfig) {
  return async (start: number, end: number) => {
    const { fromBlock, toBlock } = await getBlockRange(config.chain, start, end);
    const userTxBlocks = await getUserTxBlocks(config.chain, fromBlock, toBlock);
    const blocks = await rpcBatch(config.chain, "eth_getBlockByNumber", userTxBlocks.map((block) => [toHex(block), true]));

    const newUsers = new Set<string>();
    for (const block of blocks) {
      for (const tx of block.transactions) {
        if (Number(tx.nonce) === 0) newUsers.add(tx.from.toLowerCase());
      }
    }

    return [{ usercount: newUsers.size }];
  };
}

function toHex(value: number) {
  return "0x" + value.toString(16);
}

export const feeHistoryUsersExports = Object.entries(feeHistoryUsersChains).map(([id, config]) => ({
  name: id,
  id,
  chain: config.chain,
  type: "chain",
  start: config.start,
  getUsers: getFeeHistoryUsers(config),
  getNewUsers: getFeeHistoryNewUsers(config),
}));
