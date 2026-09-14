import { SimpleAdapter, FetchResultFees, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

interface PoolStatistics {
  pool_type: string;
  fees: {
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

const fetch = async (options: FetchOptions): Promise<FetchResultFees> => {
  if (options.dateString === '2026-09-12') {
    return {
      dailyFees: 0,
    }
  }
  const response: Array<PoolStatistics> = await fetchURL('http://api.ociswap.com/statistics/pool-types');
  const index = response.findIndex(pool => pool.pool_type === 'basic');
  const dailyFees = Number(response[index].fees.usd["24h"]);
  return {
    dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.RADIXDLT]: {
      fetch,
      start: '2023-10-01',
      //runAtCurrTime: true,
    }
  }
}
export default adapter;
