import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";
import PromisePool from "@supercharge/promise-pool";

const suilendPoolsURL = () => `https://global.suilend.fi/steamm/pools/all`;

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
  `https://global.suilend.fi/steamm/historical/volume?startTimestampS=${fromTimestamp}&endTimestampS=${toTimestamp}&intervalS=${60 * 60 * 24}&poolId=${poolId}`;


async function fetchPoolsStats(startTimestamp: number, endTimestamp: number): Promise<Array<PoolInfo>> {
  const poolInfos: Array<PoolInfo> = [];

  const poolConfigs = await fetchURL(suilendPoolsURL());
  const { results: allHistorical , errors } = await PromisePool.withConcurrency(5)
    .for(poolConfigs)
    .process((poolConfig: any) =>
      fetchURL(suilendPoolHistoricalURL(poolConfig.pool.id, startTimestamp, endTimestamp - 1))
    );

  if (errors?.length)
    throw errors[0];
  
  poolConfigs.forEach((poolConfig: any, idx: number) => {
    const dayItem = allHistorical[idx]?.find((item: Volume) => Number(item.start) === startTimestamp);
    if (dayItem) {
      poolInfos.push({
        id: poolConfig.pool.id,
        volumeUsd: Number(dayItem.usdValue),
      });
    }
  });

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
