import { PromisePool } from '@supercharge/promise-pool';
import { Adapter, ChainBlocks, FetchOptions, ProtocolType } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { postURL } from '../utils/fetchURL';

const CG_TOKEN = 'the-open-network';
const RPC = 'https://rpc.duckchain.io';
const RPC_FEE_FETCH_CONCURRENCY = 5;
const RPC_FEE_FETCH_RETRIES = 5;

async function fetchBlockReceiptsTotalFees(blockNumber: number) {
  const response = await postURL(RPC, {
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_getBlockReceipts',
    params: [`0x${blockNumber.toString(16)}`],
  }, RPC_FEE_FETCH_RETRIES);

  if (response.error) throw new Error(response.error.message ?? `RPC error fetching receipts for block ${blockNumber}`);
  if (!Array.isArray(response.result)) throw new Error(`Invalid receipts response for block ${blockNumber}`);

  return response.result.reduce((sum: bigint, receipt: any) => {
    const gasUsed = BigInt(receipt.gasUsed ?? 0);
    if (gasUsed === 0n) return sum;

    const gasPrice = receipt.effectiveGasPrice ?? receipt.gasPrice;
    if (gasPrice === undefined || gasPrice === null) throw new Error(`Missing gas price for ${receipt.transactionHash}`);

    return sum + gasUsed * BigInt(gasPrice);
  }, 0n);
}

async function fetchRpcTotalFees({ getFromBlock, getToBlock }: FetchOptions) {
  const fromBlock = await getFromBlock();
  const toBlock = await getToBlock();
  if (fromBlock > toBlock) return 0n;

  const blocks = Array.from({ length: toBlock - fromBlock + 1 }, (_, i) => fromBlock + i);
  const { results, errors } = await PromisePool
    .withConcurrency(RPC_FEE_FETCH_CONCURRENCY)
    .for(blocks)
    .process((blockNumber) => fetchBlockReceiptsTotalFees(blockNumber));

  if (errors.length > 0) throw (errors[0] as any).raw ?? errors[0];

  return (results as bigint[]).reduce((sum, fees) => sum + fees, 0n);
}

const fetch = async (_timestamp: number, _: ChainBlocks, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const fees = await fetchRpcTotalFees(options);
  dailyFees.addCGToken(CG_TOKEN, Number(fees) / 1e18);

  return {
    timestamp: options.startOfDay,
    dailyFees,
  };
};

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.DUCKCHAIN]: {
      fetch,
    },
  },
  protocolType: ProtocolType.CHAIN,
};

export default adapter;
