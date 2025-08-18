import fetchURL from '../../utils/fetchURL';
import type { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';

interface IData {
  feesUSD: number;
  volumeUSD: number;
  timestamp: number;
}

const fetch = async (options:FetchOptions) => {
  const startOfDay = options.startOfDay;
  const endpointsV2 = `https://api.hyperbrick.xyz/lb/dex/analytics?startTime=${startOfDay}&aggregateBy=daily`;

  const historical: IData[] = await fetchURL(endpointsV2);

  const dailyFees = historical.find((dayItem) => dayItem.timestamp === startOfDay)?.feesUSD || 0;
  const dailyVolume = historical.find((dayItem) => dayItem.timestamp === startOfDay)?.volumeUSD || 0;

  return {
    dailyVolume,
    dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch,
      start: '2025-07-24',
    },
  },
};
export default adapter;
