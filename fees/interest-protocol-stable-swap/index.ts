import fetchURL from '../../utils/fetchURL';
import { Chain } from '@defillama/sdk/build/general';
import { FetchResultV2, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { getUniqStartOfTodayTimestamp } from '../../helpers/getUniSubgraphVolume';

type Url = {
  [s: string]: string;
};

const url: Url = {
  [CHAIN.SUI]: `https://api.interestlabs.io/v1/sui/mainnet/stable/metrics`,
};

interface Metrics {
  tvl: string;
  apr: string;
  volume: string;
  volume1D: string;
  volume7D: string;
  volume30D: string;
  fees: string;
  fees1D: string;
  fees7D: string;
  fees30D: string;
  revenue: string;
  revenue1D: string;
  revenue7D: string;
  revenue30D: string;
}

const fetch = (chain: Chain) => {
  return async ({ endTimestamp }): Promise<FetchResultV2> => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(
      new Date(endTimestamp * 1000)
    );

    const metrics: Metrics = await fetchURL(
      `${url[chain]}?timestamp=${dayTimestamp}`
    );

    return {
      dailyFees: metrics.fees1D,
      dailyRevenue: metrics.revenue1D,
      dailyProtocolRevenue: metrics.revenue1D,
    };
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetch(CHAIN.SUI),
      start: '2025-04-04',
    },
  },
};

export default adapter;
