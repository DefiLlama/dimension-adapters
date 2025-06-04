import { ChainApi } from "@defillama/sdk";
import { Chain, } from "@defillama/sdk/build/general";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from '../helpers/coreAssets.json';

type TAddrress = {
  [l: string | Chain]: string;
}

const address: TAddrress = {
  [CHAIN.ETHEREUM]: '0x271682DEB8C4E0901D1a1550aD2e64D568E69909',
  [CHAIN.BSC]: '0xc587d9053cd1118f25F645F9E08BB98c9712A4EE',
  [CHAIN.POLYGON]: '0xAE975071Be8F8eE67addBC1A82488F1C24858067',
  [CHAIN.FANTOM]: '0xd5d517abe5cf79b7e95ec98db0f0277788aff634',
  [CHAIN.AVAX]: '0xd5D517aBE5cF79B7e95eC98dB0f0277788aFF634',
}

const topic0 = '0x7dffc5ae5ee4e2e4df1651cf6ad329a73cebdb728f37ea0187b9b17e036756e4'
const LINK = '0x514910771af9ca656af840dff83e8264ecf986ca';

const getTransactions = async (fromBlock: number, toBlock: number, api: ChainApi): Promise<{ transactions: any[]; totalPayment: number }> => {
  const TX_HASH_BATCH = 50;
  const MAX_PARALLEL = 3;

  const logs = await api.getLogs({
    target: address[api.chain],
    fromBlock,
    toBlock,
    topics: [topic0],
  });

  let totalPayment = 0;
  const seenHashes = new Set<string>();

  for (const e of logs) {
    const data = e.data?.slice(2);
    if (data?.length >= 128) {
      const paymentHex = data.slice(64, 128);
      if (paymentHex.length === 64) {
        const payment = Number(BigInt('0x' + paymentHex));
        if (!isNaN(payment)) totalPayment += payment;
      }
    }
    if (e.transactionHash) seenHashes.add(e.transactionHash);
  }

  const txHashBatches = Array.from(seenHashes).reduce<string[][]>((batches, hash, i) => {
    const batchIndex = Math.floor(i / TX_HASH_BATCH);
    if (!batches[batchIndex]) batches[batchIndex] = [];
    batches[batchIndex].push(hash);
    return batches;
  }, []);

  const allTransactions: any[] = [];

  for (let i = 0; i < txHashBatches.length; i += MAX_PARALLEL) {
    const chunks = txHashBatches.slice(i, i + MAX_PARALLEL);
    const results = await Promise.all(
      chunks.map((hashChunk) =>
        api.getTransactions({
          chain: api.chain,
          from_block: fromBlock,
          to_block: toBlock,
          transaction_hashes: hashChunk,
        })
      )
    );
    results.forEach((txs) => allTransactions.push(...txs));
  }

  return { transactions: allTransactions, totalPayment };
};

const fetch = async (_: any, _1: any, { getFromBlock, getToBlock, createBalances, api }: FetchOptions) => {
  const [fromBlock, toBlock] = await Promise.all([getFromBlock(), getToBlock()])
  const dailyRevenue = createBalances()
  const dailyGas = createBalances()
  const dailyPayment = createBalances()
  const { transactions, totalPayment } = await getTransactions(fromBlock, toBlock, api)

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
