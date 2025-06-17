import { ChainApi } from "@defillama/sdk";
import pLimit from "p-limit";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from '../helpers/coreAssets.json';

const topics = {
  upkeepPerformed: '0xcaacad83e47cc45c280d487ec84184eee2fa3b54ebaa393bda7549f13da228f6',
  success: '0x0000000000000000000000000000000000000000000000000000000000000001'
}

const eventAbis = {
    upkeepPerformed: "event UpkeepPerformed(uint256 indexed id, bool indexed success, address indexed from, uint96 payment, bytes performData)",
}

type TAddrress = {
  [l: string | CHAIN]: string;
}

const LINK = '0x514910771af9ca656af840dff83e8264ecf986ca';

const address: TAddrress = {
  [CHAIN.ETHEREUM]: '0x02777053d6764996e594c3E88AF1D58D5363a2e6',
  [CHAIN.BSC]: '0x02777053d6764996e594c3E88AF1D58D5363a2e6',
  [CHAIN.POLYGON]: '0x02777053d6764996e594c3E88AF1D58D5363a2e6',
  [CHAIN.FANTOM]: '0x02777053d6764996e594c3E88AF1D58D5363a2e6',
  [CHAIN.AVAX]: '0x02777053d6764996e594c3E88AF1D58D5363a2e6',
  [CHAIN.ARBITRUM]: '0x75c0530885F385721fddA23C539AF3701d6183D4',
  [CHAIN.OPTIMISM]: '0x75c0530885F385721fddA23C539AF3701d6183D4'
}

const getTransactions = async (fromBlock: number, toBlock: number, api: ChainApi): Promise<{ transactions: any[]; totalPayment: number }> => {
  const target = address[api.chain];
  const TX_HASH_BATCH = 50;
  const MAX_PARALLEL = 3;

  const logs = await api.getLogs({
    target,
    fromBlock,
    toBlock,
    topics: [topics.upkeepPerformed, '', topics.success],
    eventAbi: eventAbis.upkeepPerformed,
    entireLog: true
  });

  let totalPayment = 0;
  const seenHashes = new Set<string>();

  for (const e of logs) {
    const { transactionHash, args } = e
    if (args.payment) totalPayment += Number(args.payment)
    if (transactionHash) seenHashes.add(transactionHash);
  }

  const txHashBatches: string[][] = [];
  let currentBatch: string[] = [];

  for (const hash of seenHashes) {
    currentBatch.push(hash);
    if (currentBatch.length === TX_HASH_BATCH) {
      txHashBatches.push(currentBatch);
      currentBatch = [];
    }
  }
  if (currentBatch.length) txHashBatches.push(currentBatch);

  const allTransactions: any[] = [];
  const limit = pLimit(MAX_PARALLEL);

  const results = await Promise.all(
    txHashBatches.map((hashChunk) =>
      limit(() =>
        api.getTransactions({
          chain: api.chain,
          addresses: [target],
          from_block: fromBlock,
          to_block: toBlock,
          transaction_hashes: hashChunk,
          transactionType: "to"
        }).catch((err) => {
          console.error(`Failed to fetch transactions on ${api.chain}:`, err);
          return [];
        })
      )
    )
  );

  results.forEach((txs) => {
    if (Array.isArray(txs)) {
      allTransactions.push(...txs);
    }
  });

  return { transactions: allTransactions, totalPayment };
};

const fetch = async (_: any, _1: any, { getFromBlock, getToBlock, createBalances, api }: FetchOptions) => {
  const [fromBlock, toBlock] = await Promise.all([getFromBlock(), getToBlock()])
  const dailyRevenue = createBalances()
  const dailyGas = createBalances()
  const dailyPayment = createBalances()
  const { transactions, totalPayment } =  await getTransactions(fromBlock, toBlock, api)

  const dailyGasUsed = transactions.reduce((acc, tx) => {
    const gasUsed = Number(tx.gasUsed ?? 0);
    const effectiveGasPrice = Number(tx.effectiveGasPrice ?? tx.gasPrice);
    return acc + gasUsed * effectiveGasPrice;
  }, 0);

  dailyGas.add(ADDRESSES.null, dailyGasUsed)
  dailyPayment.add(LINK, totalPayment, { skipChain: true })
  dailyRevenue.addUSDValue(await dailyPayment.getUSDValue() - await dailyGas.getUSDValue())

  return { dailyFees: dailyPayment, dailyRevenue }
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2023-02-03',
    },
    [CHAIN.BSC]: {
      fetch,
      start: '2023-02-03',
    },
    [CHAIN.POLYGON]: {
      fetch,
      start: '2023-02-03',
    },
    [CHAIN.FANTOM]: {
      fetch,
      start: '2023-02-03',
    },
    [CHAIN.AVAX]: {
      fetch,
      start: '2023-02-03',
    },
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2023-02-03',
    },
    [CHAIN.OPTIMISM]: {
      fetch,
      start: '2023-02-03'
    }
  }
}
export default adapter;
