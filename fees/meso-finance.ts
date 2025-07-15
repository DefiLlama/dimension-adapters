import fetchURL from '../utils/fetchURL';
import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';

const feesQueryURL =
  'https://api.meso.finance/api/v1/Tool/defillama/fees?timeframe=';

const revenueQueryURL = 
  'https://api.meso.finance/api/v1/Tool/defillama/revenue?timeframe=';

interface IVolumeall {
  value: number;
  timestamp: number;
}

const feesEndpoint = (timestamp: number, timeframe: string) =>
  timestamp
    ? feesQueryURL + timeframe + `&timestamp=${timestamp}`
    : feesQueryURL + timeframe;

const revenueEndpoint = (timestamp: number, timeframe: string) =>
  timestamp
    ? revenueQueryURL + timeframe + `&timestamp=${timestamp}`
    : revenueQueryURL + timeframe;

const config: Record<
  string,
  { fees: (timestamp: number, timeframe: string) => string, revenue: (timestamp: number, timeframe: string) => string }
> = {
  [CHAIN.APTOS]: {
    fees: feesEndpoint,
    revenue: revenueEndpoint
  }
};

const fetch = async (timestamp: number, _: any, options: FetchOptions) => {
  const dayFeesData = await fetchURL(config[options.chain].fees(timestamp, '1D'));
  const dailyFees = dayFeesData.filter((a: IVolumeall) => a.timestamp >= timestamp).reduce((partialSum: number, a: IVolumeall) => partialSum + a.value, 0);

  const dayRevenueData = await fetchURL(config[options.chain].revenue(timestamp, '1D'));
  const dailyRevenue = dayRevenueData.filter((a: IVolumeall) => a.timestamp >= timestamp).reduce((partialSum: number, a: IVolumeall) => partialSum + a.value, 0);

  const dailySupplySideRevenue = dailyFees - dailyRevenue;
  
  return {
    dailyFees: dailyFees,
    dailyRevenue: dailyRevenue,
    dailySupplySideRevenue: dailySupplySideRevenue
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.APTOS]: {
      fetch,
      start: '2024-09-28',
    },
  },
};

export default adapter;
