import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { METRIC } from "../helpers/metrics";
import { httpPost } from "../utils/fetchURL";

const CHAIN = "csc";
const RPC = "https://rpc.coinex.net";
const CET_COINGECKO_ID = "coinex-token";
const BATCH_SIZE = 100;

type RpcRequest = {
  jsonrpc: "2.0";
  method: string;
  params: any[];
  id: number;
};

type RpcResponse<T> = {
  id: number;
  result?: T;
  error?: { message?: string };
};

type Block = {
  number: string;
  timestamp: string;
  gasUsed: string;
  transactions: Array<string | Transaction>;
};

type Transaction = {
  hash: string;
  gasPrice: string;
};

type Receipt = {
  transactionHash: string;
  gasUsed: string;
};

const toHex = (value: number) => `0x${value.toString(16)}`;
const hexToNumber = (value: string) => Number(value);
const hexToBigInt = (value: string) => BigInt(value);
const weiToNumber = (value: bigint) => Number(value / 10n ** 10n) / 1e8;

const rpc = async <T>(method: string, params: any[]): Promise<T> => {
  const response: RpcResponse<T> = await httpPost(RPC, {
    jsonrpc: "2.0",
    method,
    params,
    id: 1,
  });

  if (response.error || response.result === undefined) {
    throw new Error(`CSC RPC ${method} failed: ${response.error?.message ?? "missing result"}`);
  }

  return response.result;
};

const rpcBatch = async <T>(requests: RpcRequest[]): Promise<RpcResponse<T>[]> => {
  if (requests.length === 0) return [];
  const responses: RpcResponse<T>[] = await httpPost(RPC, requests);
  const failedResponse = responses.find(({ error, result }) => error || result === undefined);

  if (failedResponse) {
    throw new Error(`CSC RPC batch request ${failedResponse.id} failed: ${failedResponse.error?.message ?? "missing result"}`);
  }

  return responses;
};

const getBlock = (block: number, fullTransactions = false) =>
  rpc<Block>("eth_getBlockByNumber", [toHex(block), fullTransactions]);

const getLatestBlockNumber = async () => hexToNumber(await rpc<string>("eth_blockNumber", []));

const getFirstBlockAtOrAfter = async (timestamp: number) => {
  const latestBlockNumber = await getLatestBlockNumber();
  const latestBlock = await getBlock(latestBlockNumber);
  if (hexToNumber(latestBlock.timestamp) < timestamp) return latestBlockNumber + 1;

  let low = 1;
  let high = latestBlockNumber;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const block = await getBlock(mid);
    if (hexToNumber(block.timestamp) >= timestamp) high = mid;
    else low = mid + 1;
  }

  return low;
};

const getBlocks = async (fromBlock: number, toBlock: number) => {
  const blocks: Block[] = [];

  for (let start = fromBlock; start <= toBlock; start += BATCH_SIZE) {
    const end = Math.min(start + BATCH_SIZE - 1, toBlock);
    const requests: RpcRequest[] = [];
    for (let block = start; block <= end; block++) {
      requests.push({
        jsonrpc: "2.0",
        method: "eth_getBlockByNumber",
        params: [toHex(block), true],
        id: block,
      });
    }

    const responses = await rpcBatch<Block>(requests);
    blocks.push(...responses.map(({ result }) => result as Block));
  }

  return blocks;
};

const getReceipts = async (transactions: Transaction[]) => {
  const receipts = new Map<string, Receipt>();

  for (let start = 0; start < transactions.length; start += BATCH_SIZE) {
    const chunk = transactions.slice(start, start + BATCH_SIZE);
    const requests = chunk.map((transaction, index) => ({
      jsonrpc: "2.0" as const,
      method: "eth_getTransactionReceipt",
      params: [transaction.hash],
      id: start + index,
    }));

    const responses = await rpcBatch<Receipt>(requests);
    responses.forEach(({ result }) => {
      receipts.set((result as Receipt).transactionHash, result as Receipt);
    });
  }

  return receipts;
};

const fetch = async (_timestamp: number, _chainBlocks: any, options: FetchOptions) => {
  const fromBlock = await getFirstBlockAtOrAfter(options.startTimestamp);
  const toBlock = (await getFirstBlockAtOrAfter(options.endTimestamp)) - 1;
  const dailyFees = options.createBalances();

  if (fromBlock > toBlock) return { dailyFees, dailyRevenue: 0 };

  const blocks = await getBlocks(fromBlock, toBlock);
  const transactions = blocks
    .flatMap((block) => block.transactions)
    .filter((transaction): transaction is Transaction => typeof transaction !== "string");
  const receipts = await getReceipts(transactions);

  const fees = transactions.reduce((sum, transaction) => {
    const receipt = receipts.get(transaction.hash);
    if (!receipt) return sum;
    return sum + hexToBigInt(transaction.gasPrice) * hexToBigInt(receipt.gasUsed);
  }, 0n);

  dailyFees.addCGToken(CET_COINGECKO_ID, weiToNumber(fees), METRIC.TRANSACTION_GAS_FEES);

  return { dailyFees, dailyRevenue: 0 };
};

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN],
  start: "2021-06-25",
  protocolType: ProtocolType.CHAIN,
  skipBreakdownValidation: true,
  methodology: {
    Fees: "Transaction gas fees paid by users on CSC, calculated from gasPrice * gasUsed via public CSC RPC.",
    Revenue: "CSC does not burn gas fees, so chain revenue is reported as zero.",
  },
};

export default adapter;
