import fetchURL from '../utils/fetchURL';
import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';

const feesQueryURL = 'https://api.meso.finance/api/v1/Tool/defillama/fees?timeframe=';

interface IVolumeall {
  value: number;
  timestamp: number;
}

const fetch = async (timestamp: number, _: any, options: FetchOptions) => {
  const url = feesQueryURL + '1D' + `&timestamp=${timestamp}`
  const dayFeesData = await fetchURL(url);

  const dailyFees = dayFeesData.filter((a: IVolumeall) => a.timestamp >= options.startTimestamp && a.timestamp <= options.endTimestamp).reduce((partialSum: number, a: IVolumeall) => partialSum + a.value, 0);

  return {
    dailyFees
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.APTOS]: {
      fetch,
      start: '2024-09-28',
    },
  },
};

export default adapter;
