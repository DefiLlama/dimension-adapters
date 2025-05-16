import fetchURL from '../../utils/fetchURL';
import { FetchResultV2, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';

const url: any = {
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

async function fetch(
  _: any,
  _1: any,
  { endTimestamp, chain }
): Promise<FetchResultV2> {
  const metrics: Metrics = await fetchURL(
    `${url[chain]}?timestamp=${endTimestamp}`
  );

  return {
    dailyVolume: metrics.volume1D,
    dailyFees: metrics.fees1D,
    dailyRevenue: metrics.revenue1D,
  };
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SUI]: {
      fetch,
      start: '2025-04-04',
    },
  },
};

export default adapter;
