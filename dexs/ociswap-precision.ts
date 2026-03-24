import { SimpleAdapter, FetchResultVolume } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

interface PoolStatistics {
  pool_type: string;
  volume: {
    xrd: {
      '24h': string;
      total: string;
    };
    usd: {
      '24h': string;
      total: string;
    };
  };
}

const fetch = async (): Promise<FetchResultVolume> => {
  const response: Array<PoolStatistics> = await fetchURL('http://api.ociswap.com/statistics/pool-types');
  const index = response.findIndex(pool => pool.pool_type === 'precision');
  const dailyVolume = Number(response[index].volume.usd["24h"]);
  return {
    dailyVolume: dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.RADIXDLT]: {
      fetch,
      start: '2023-10-01',
      runAtCurrTime: true,
    }
  }
}
export default adapter;
