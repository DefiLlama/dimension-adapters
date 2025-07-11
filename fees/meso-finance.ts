import fetchURL from '../utils/fetchURL';
import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';

const feesQueryURL =
  'https://api.meso.finance/api/v1/Tool/defillama/fees?timeframe=';

interface IVolumeall {
  value: number;
  timestamp: number;
}

const feesEndpoint = (timestamp: number, timeframe: string) =>
  timestamp
    ? feesQueryURL + timeframe + `&timestamp=${timestamp}`
    : feesQueryURL + timeframe;

const config: Record<
  string,
  (endTimestamp: number, timeframe: string) => string
> = {
  [CHAIN.APTOS]: feesEndpoint,
};

const fetch = async (timestamp: number, _: any, options: FetchOptions) => {
  const dayFeesData = await fetchURL(config[options.chain](timestamp, '1D'));

  const dailyFees = dayFeesData.filter((a: IVolumeall) => a.timestamp >= timestamp).reduce((partialSum: number, a: IVolumeall) => partialSum + a.value, 0);

  return {
    dailyFees: dailyFees
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
