import type { FetchOptions, } from "../../adapters/types";
import { Adapter, ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import PromisePool from '@supercharge/promise-pool';
import BigNumber from "bignumber.js";
import { httpGet } from "../../utils/fetchURL";
import { sleep } from "../../utils/utils";

const ARWEAVE_GATEWAY = 'https://arweave.net';
const VIEWBLOCK_FEES_URL = 'https://api.viewblock.io/arweave/stats/advanced/charts/txFees?network=mainnet';
const DAY_SECONDS = 24 * 60 * 60;
const WINSTON_PER_AR = 1e12;
const BLOCK_CONCURRENCY = 8;
const REWARD_CONCURRENCY = 24;

type ArweaveInfo = {
  height: number;
};

type ArweaveBlock = {
  height: number;
  timestamp: number;
  txs?: string[];
};

type ViewBlockFeesResponse = {
  day?: {
    data?: [number[], string[]];
  };
};

const withRetry = async <T>(action: () => Promise<T>, retries = 3): Promise<T> => {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep((attempt + 1) * 1000);
    }
  }

  throw lastError;
}

const arweaveGet = async <T>(path: string) => withRetry<T>(() => httpGet(`${ARWEAVE_GATEWAY}${path}`));

const getLatestHeight = async () => {
  const info = await arweaveGet<ArweaveInfo>('/info');
  if (!Number.isInteger(info.height)) throw new Error('Could not read latest Arweave block height');
  return info.height;
}

const getBlockTimestamp = async (height: number) => {
  const block = await arweaveGet<ArweaveBlock>(`/block/height/${height}`);
  if (!Number.isInteger(block.timestamp)) throw new Error(`Could not read timestamp for Arweave block ${height}`);
  return block.timestamp;
}

const findFirstBlockAtOrAfter = async (timestamp: number, latestHeight: number) => {
  let low = 0;
  let high = latestHeight + 1;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const blockTimestamp = await getBlockTimestamp(mid);

    if (blockTimestamp < timestamp) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
}

const fetchViewBlockFees = async (startOfDay: number) => {
  const data = await withRetry<ViewBlockFeesResponse>(() => httpGet(VIEWBLOCK_FEES_URL, {
    headers: {
      origin: 'https://arscan.io'
    }
  }));

  const timestamps = data.day?.data?.[0];
  const fees = data.day?.data?.[1];
  if (!Array.isArray(timestamps) || !Array.isArray(fees)) throw new Error('ViewBlock did not return Arweave fee chart data');

  const dayTimestamp = startOfDay * 1000;
  const index = timestamps.findIndex((timestamp) => timestamp === dayTimestamp);
  if (index === -1) return undefined;

  const fee = new BigNumber(fees[index]);
  if (!fee.isFinite()) throw new Error(`Invalid ViewBlock Arweave fee value for ${new Date(dayTimestamp).toISOString()}`);

  return fee;
}

const getTransactionReward = async (txId: string) => {
  const reward = String(await arweaveGet<string>(`/tx/${txId}/reward`)).trim();
  if (!/^\d+$/.test(reward)) throw new Error(`Invalid Arweave reward for tx ${txId}`);
  return BigInt(reward);
}

const getBlockTransactionIds = async (height: number) => {
  const block = await arweaveGet<ArweaveBlock>(`/block/height/${height}`);
  if (!Array.isArray(block.txs)) throw new Error(`Could not read transactions for Arweave block ${height}`);
  return block.txs;
}

const fetchNodeRewardFees = async (options: FetchOptions) => {
  const latestHeight = await getLatestHeight();
  const startHeight = await findFirstBlockAtOrAfter(options.startOfDay, latestHeight);
  const nextDayHeight = await findFirstBlockAtOrAfter(options.startOfDay + DAY_SECONDS, latestHeight);
  if (nextDayHeight <= startHeight) return new BigNumber(0);

  const heights = Array.from({ length: nextDayHeight - startHeight }, (_, index) => startHeight + index);
  const { results: txIdGroups, errors: blockErrors } = await PromisePool
    .withConcurrency(BLOCK_CONCURRENCY)
    .for(heights)
    .process(getBlockTransactionIds);
  if (blockErrors.length) throw blockErrors[0];

  const txIds = txIdGroups.flat();
  const { results: rewards, errors: rewardErrors } = await PromisePool
    .withConcurrency(REWARD_CONCURRENCY)
    .for(txIds)
    .process(getTransactionReward);
  if (rewardErrors.length) throw rewardErrors[0];

  const totalWinston = rewards.reduce((total, reward) => total + reward, 0n);
  return new BigNumber(totalWinston.toString()).div(WINSTON_PER_AR);
}

const getDailyFees = async (options: FetchOptions) => {
  try {
    const viewBlockFees = await fetchViewBlockFees(options.startOfDay);
    if (viewBlockFees !== undefined) return viewBlockFees;
  } catch (error) {
    console.error(`Failed to fetch Arweave fees from ViewBlock, falling back to Arweave node data`, error);
  }

  return fetchNodeRewardFees(options);
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const tokenAmount = (await getDailyFees(options)).toNumber();

  const dailyFees = options.createBalances();
  dailyFees.addCGToken('arweave', tokenAmount)

  return {
    dailyFees
  }
}

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.ARWEAVE]: {
      fetch,
      start: '2018-06-08',
    },
  },
  protocolType: ProtocolType.CHAIN,
  skipBreakdownValidation: true,
  methodology: {
    Fees: 'Transaction fees paid by users in AR. Daily totals are sourced from ViewBlock/Arscan. If that chart is unavailable for a day, the adapter falls back to Arweave node data by locating the daily block range and summing each base-layer transaction reward field.'
  }
}

export default adapter;
