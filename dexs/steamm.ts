import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const suilendPoolsURL = () => `https://api.suilend.fi/steamm/pools/all`;

interface PoolInfo {
  id: string;
  volumeUsd: number;
}

interface Volume {
  start: number;
  end: number;
  usdValue: string;
}

const suilendPoolHistoricalURL = (
  poolId: string,
  fromTimestamp: number,
  toTimestamp: number
) =>
  `https://api.suilend.fi/steamm/historical/volume?startTimestampS=${fromTimestamp}&endTimestampS=${toTimestamp}&intervalS=${60 * 60 * 24}&poolId=${poolId}`;


async function fetchPoolsStats(startTimestamp: number, endTimestamp: number): Promise<Array<PoolInfo>> {
  const poolInfos: Array<PoolInfo> = [];

  const poolConfigs = await fetchURL(suilendPoolsURL());
  for (const poolConfig of poolConfigs) {
    const historicalItems: Array<Volume> = await fetchURL(
      suilendPoolHistoricalURL(
        poolConfig.pool.id,
        startTimestamp,
        endTimestamp - 1,
      )
    );
    const dayItem = historicalItems.find(item => Number(item.start) === startTimestamp)
    if (dayItem) {
      poolInfos.push({
        id: poolConfig.pool.id,
        volumeUsd: Number(dayItem.usdValue),
      });
    }
  }

  return poolInfos;
}

const fetch = async ({ startTimestamp, endTimestamp, }: FetchOptions) => {
  const pools = await fetchPoolsStats(startTimestamp, endTimestamp);
  const dailyVolume = pools.reduce((acc, pool) => acc + pool.volumeUsd, 0);
  return {
    dailyVolume,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.SUI]: {
      fetch,
      start: '2025-02-16',
    },
  },
};

export default adapter;
