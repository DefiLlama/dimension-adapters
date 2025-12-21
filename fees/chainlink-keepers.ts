import { ChainApi } from "@defillama/sdk";
import pLimit from "p-limit";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";

const topics = {
  upkeepPerformed:
    "0xad8cc9579b21dfe2c2f6ea35ba15b656e46b4f5b0cb424f52739b8ce5cac9c5b",
  success: "0x0000000000000000000000000000000000000000000000000000000000000001",
};

const eventAbis = {
  upkeepPerformed:
    "event UpkeepPerformed(uint256 indexed id, bool indexed success, uint96 totalPayment, uint256 gasUsed, uint256 gasOverhead, bytes trigger)",
};

type TAddress = {
  [l: string | CHAIN]: string;
};

const LINK = ADDRESSES.ethereum.LINK;

// Chainlink Automation v2.1+ Registry addresses
// Source: https://docs.chain.link/chainlink-automation/overview/supported-networks
const address: TAddress = {
  [CHAIN.ETHEREUM]: "0x6593c7De001fC8542bB1703532EE1E5aA0D458fD",
  [CHAIN.BSC]: "0xDc21E279934fF6721CaDfDD112DAfb3261f09A2C",
  [CHAIN.POLYGON]: "0x08a8eea76D2395807Ce7D1FC942382515469cCA1",
  [CHAIN.AVAX]: "0x7f00a3Cd4590009C349192510D51F8e6312E08CB",
  [CHAIN.ARBITRUM]: "0x37D9dC70bfcd8BC77Ec2858836B923c560E891D1",
  [CHAIN.OPTIMISM]: "0x4F70c323b8B72AeffAF633Aa4D5e8B6Be5df4AEf",
  [CHAIN.BASE]: "0xf4bAb6A129164aBa9B113cB96BA4266dF49f8743",
  [CHAIN.XDAI]: "0x299c92a219F61a82E91d2062A262f7157F155AC1",
  [CHAIN.POLYGON_ZKEVM]: "0x0F7E163446AAb41DB5375AbdeE2c3eCC56D9aA32",
  [CHAIN.SCROLL]: "0xBe55E7eb27Cd69Be0883E0284632A91bB7AdC272",
  [CHAIN.ERA]: "0x8D405a2252fe4bd50dF29835e621986E59A81D74",
};

const getTransactions = async (
  fromBlock: number,
  toBlock: number,
  api: ChainApi
): Promise<{ transactions: any[]; totalPayment: number }> => {
  const target = address[api.chain];
  const TX_HASH_BATCH = 50;
  const MAX_PARALLEL = 3;

  const logs = await api.getLogs({
    target,
    fromBlock,
    toBlock,
    topics: [topics.upkeepPerformed, null, topics.success],
    eventAbi: eventAbis.upkeepPerformed,
    entireLog: true,
  });

  let totalPayment = 0;
  const seenHashes = new Set<string>();

  for (const e of logs) {
    const { transactionHash, args } = e;
    if (args.totalPayment) totalPayment += Number(args.totalPayment);
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
        api
          .getTransactions({
            chain: api.chain,
            addresses: [target],
            from_block: fromBlock,
            to_block: toBlock,
            transaction_hashes: hashChunk,
            transactionType: "to",
          })
          .catch((err) => {
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

const fetch = async (
  _: any,
  _1: any,
  { getFromBlock, getToBlock, createBalances, api }: FetchOptions
) => {
  const [fromBlock, toBlock] = await Promise.all([
    getFromBlock(),
    getToBlock(),
  ]);
  const dailyRevenue = createBalances();
  const dailyGas = createBalances();
  const dailyPayment = createBalances();
  const { transactions, totalPayment } = await getTransactions(
    fromBlock,
    toBlock,
    api
  );

  const dailyGasUsed = transactions.reduce((acc, tx) => {
    const gasUsed = Number(tx.gasUsed ?? 0);
    const effectiveGasPrice = Number(tx.effectiveGasPrice ?? tx.gasPrice);
    return acc + gasUsed * effectiveGasPrice;
  }, 0);

  dailyGas.add(ADDRESSES.null, dailyGasUsed);
  dailyPayment.add(LINK, totalPayment, { skipChain: true });
  dailyRevenue.addUSDValue(
    (await dailyPayment.getUSDValue()) - (await dailyGas.getUSDValue())
  );

  return { dailyFees: dailyPayment, dailyRevenue };
};

const methodology = {
  Fees: 'LINK tokens paid by users for automated smart contract executions.',
  Revenue: 'LINK payments minus gas costs paid to node operators.',
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    // Start dates based on first deployed registry contract
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "2023-09-14",
    },
    [CHAIN.BSC]: {
      fetch,
      start: "2023-09-13",
    },
    [CHAIN.POLYGON]: {
      fetch,
      start: "2023-09-13",
    },
    [CHAIN.AVAX]: {
      fetch,
      start: "2023-09-13",
    },
    [CHAIN.ARBITRUM]: {
      fetch,
      start: "2023-09-13",
    },
    [CHAIN.OPTIMISM]: {
      fetch,
      start: "2025-06-13",
    },
    [CHAIN.BASE]: {
      fetch,
      start: "2024-09-05",
    },
    [CHAIN.XDAI]: {
      fetch,
      start: "2024-02-28",
    },
    [CHAIN.POLYGON_ZKEVM]: {
      fetch,
      start: "2024-11-05",
    },
    [CHAIN.SCROLL]: {
      fetch,
      start: "2024-11-01",
    },
    [CHAIN.ERA]: {
      fetch,
      start: "2024-11-12",
    },
  },
  methodology,
};
export default adapter;
