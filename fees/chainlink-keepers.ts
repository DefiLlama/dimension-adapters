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
  [l: string | CHAIN]: {
    address: string;
    start: string;
  };
};

const LINK = ADDRESSES.ethereum.LINK;

// Chainlink Automation v2.1+ Registry addresses
// Source: https://docs.chain.link/chainlink-automation/overview/supported-networks
const addresses: TAddress = {
  [CHAIN.ETHEREUM]: {
    address: '0x6593c7De001fC8542bB1703532EE1E5aA0D458fD',
    start: "2023-09-14",
  },
  [CHAIN.BSC]: {
    address: '0xDc21E279934fF6721CaDfDD112DAfb3261f09A2C',
    start: "2023-09-13",
  },
  [CHAIN.POLYGON]: {
    address: '0x08a8eea76D2395807Ce7D1FC942382515469cCA1',
    start: "2023-09-13",
  },
  [CHAIN.AVAX]: {
    address: '0x7f00a3Cd4590009C349192510D51F8e6312E08CB',
    start: "2023-09-13",
  },
  [CHAIN.ARBITRUM]: {
    address: '0x37D9dC70bfcd8BC77Ec2858836B923c560E891D1',
    start: "2023-09-13",
  },
  [CHAIN.OPTIMISM]: {
    address: '0x4F70c323b8B72AeffAF633Aa4D5e8B6Be5df4AEf',
    start: "2025-06-13",
  },
  [CHAIN.BASE]: {
    address: '0xf4bAb6A129164aBa9B113cB96BA4266dF49f8743',
    start: "2024-09-05",
  },
  [CHAIN.XDAI]: {
    address: '0x299c92a219F61a82E91d2062A262f7157F155AC1',
    start: "2024-02-28",
  },
  [CHAIN.POLYGON_ZKEVM]: {
    address: '0x0F7E163446AAb41DB5375AbdeE2c3eCC56D9aA32',
    start: "2024-11-05",
  },
  [CHAIN.SCROLL]: {
    address: '0xBe55E7eb27Cd69Be0883E0284632A91bB7AdC272',
    start: "2024-11-01",
  },
  [CHAIN.ERA]: {
    address: '0x8D405a2252fe4bd50dF29835e621986E59A81D74',
    start: "2024-11-12",
  },
};

const getTransactions = async (
  fromBlock: number,
  toBlock: number,
  api: ChainApi,
  getLogs: FetchOptions["getLogs"]
): Promise<{ transactions: any[]; totalPayment: number }> => {
  const target = addresses[api.chain].address;
  const TX_HASH_BATCH = 50;
  const MAX_PARALLEL = 3;

  const logs = await getLogs({
    target,
    topics: [topics.upkeepPerformed, null, topics.success] as any[],
    eventAbi: eventAbis.upkeepPerformed,
    onlyArgs: false,
  });

  let totalPayment = 0;
  const seenHashes = new Set<string>();

  for (const e of logs) {
    const { transactionHash, args } = e;
    if (args?.totalPayment) totalPayment += Number(args.totalPayment);
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
            throw err;
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

const fetch = async ({ createBalances, api, fromApi, toApi, getLogs }: FetchOptions) => {
  const fromBlock = Number(fromApi.block)
  const toBlock = Number(toApi.block)
  const dailyRevenue = createBalances();
  const dailyGas = createBalances();
  const dailyPayment = createBalances();
  const { transactions, totalPayment } = await getTransactions(fromBlock, toBlock, api, getLogs);

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

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: addresses,
  allowNegativeValue: true, // payments are lower than gas fees paid
  methodology: {
    Fees: 'LINK tokens paid by users for automated smart contract executions.',
    Revenue: 'LINK payments minus gas costs paid to node operators.',
  },
};
export default adapter;
