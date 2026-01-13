import { ChainApi } from "@defillama/sdk";
import pLimit from "p-limit";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from '../helpers/coreAssets.json';

const topics = {
  topic0: '0x56bd374744a66d531874338def36c906e3a6cf31176eb1e9afd9f1de69725d51'
}

const eventAbis = {
  randomnessRequest: "event RandomnessRequest(bytes32 keyHash, uint256 seed, bytes32 indexed jobID, address sender, uint256 fee, bytes32 requestID)",
}

const LINK = ADDRESSES.ethereum.LINK;

type TAddrress = {
  [l: string | CHAIN]: string;
}

const address: TAddrress = {
  [CHAIN.ETHEREUM]: '0xf0d54349addcf704f77ae15b96510dea15cb7952',
  [CHAIN.BSC]: '0x747973a5A2a4Ae1D3a8fDF5479f1514F65Db9C31',
  [CHAIN.POLYGON]: '0x3d2341ADb2D31f1c5530cDC622016af293177AE0'
}

const getTransactions = async (fromBlock: number, toBlock: number, api: ChainApi, getLogs: FetchOptions["getLogs"]): Promise<{ transactions: any[]; totalPayment: number }> => {
  const target = address[api.chain];
  const TX_HASH_BATCH = 50;
  const MAX_PARALLEL = 3;

  const logs = await getLogs({
    target,
    topics: [topics.topic0],
    eventAbi: eventAbis.randomnessRequest,
    entireLog: true
  });
  
  let totalPayment = 0;
  const seenHashes = new Set<string>();

  for (const e of logs) {
    const { transactionHash, args } = e
    if (args.fee) totalPayment += Number(args.fee)
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

const fetch = async (_: any, _1: any, { getFromBlock, getToBlock, createBalances, api, getLogs, }: FetchOptions) => {
  const [fromBlock, toBlock] = await Promise.all([getFromBlock(), getToBlock()])
  const dailyRevenue = createBalances()
  const dailyGas = createBalances()
  const dailyPayment = createBalances()
  const { transactions, totalPayment } =  await getTransactions(fromBlock, toBlock, api, getLogs)

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
  },
}
export default adapter;