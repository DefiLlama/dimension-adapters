import fetchURL from '../../utils/fetchURL';
import type { SimpleAdapter } from '../../adapters/types';
import { getUniqStartOfTodayTimestamp } from '../../helpers/getUniSubgraphVolume';
import { CHAIN } from '../../helpers/chains';

interface IData {
  feesUSD: number;
  volumeUSD: number;
  timestamp: number;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const endpointsV2 = `https://api.hyperbrick.xyz/lb/dex/analytics?startTime=${dayTimestamp}&aggregateBy=daily`;

  const historical: IData[] = await fetchURL(endpointsV2);

  const dailyFees = historical.find((dayItem) => dayItem.timestamp === dayTimestamp)?.feesUSD || 0;
  const dailyVolume = historical.find((dayItem) => dayItem.timestamp === dayTimestamp)?.volumeUSD || 0;

  return {
    dailyFees: dailyFees,
    dailyVolume: dailyVolume,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch,
      start: '2025-07-24',
    },
  },
};
export default adapter;
