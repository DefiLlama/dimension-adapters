import { ChainApi } from "@defillama/sdk";
import pLimit from 'p-limit';
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from '../helpers/coreAssets.json';

const topics = {
  topic0: '0x7dffc5ae5ee4e2e4df1651cf6ad329a73cebdb728f37ea0187b9b17e036756e4'
}

const eventAbis = {
  randomWordsFulfilled: "event RandomWordsFulfilled(uint256 indexed requestId, uint256 outputSeed, uint96 payment, bool success)",
}

const LINK = ADDRESSES.ethereum.LINK;

type TAddrress = {
  [l: string | CHAIN]: string;
}

const address: TAddrress = {
  [CHAIN.ETHEREUM]: '0x271682DEB8C4E0901D1a1550aD2e64D568E69909',
  [CHAIN.BSC]: '0xc587d9053cd1118f25F645F9E08BB98c9712A4EE',
  [CHAIN.POLYGON]: '0xAE975071Be8F8eE67addBC1A82488F1C24858067',
  [CHAIN.FANTOM]: '0xd5d517abe5cf79b7e95ec98db0f0277788aff634',
  [CHAIN.AVAX]: '0xd5D517aBE5cF79B7e95eC98dB0f0277788aFF634',
}

const getTransactions = async (fromBlock: number, toBlock: number, api: ChainApi, getLogs: FetchOptions["getLogs"]): Promise<{ transactions: any[]; totalPayment: number }> => {
  const target = address[api.chain];
  const TX_HASH_BATCH = 50;
  const MAX_PARALLEL = 2;

  const logs = await getLogs({
    target,
    topics: [topics.topic0],
    eventAbi: eventAbis.randomWordsFulfilled,
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

const fetch = async (_: any, _1: any, { getFromBlock, getToBlock, createBalances, api, getLogs }: FetchOptions) => {
  const [fromBlock, toBlock] = await Promise.all([getFromBlock(), getToBlock()])
  const dailyRevenue = createBalances()
  const dailyGas = createBalances()
  const dailyPayment = createBalances()
  const { transactions, totalPayment } = await getTransactions(fromBlock, toBlock, api, getLogs)

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
  allowNegativeValue: true, // Chainlink VRF nodes collect LINK fees and pay ETH gas to fulfill randomness.
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
    }
  },
}
export default adapter;
