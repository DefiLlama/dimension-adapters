import fetchURL from "../../utils/fetchURL";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const fetch = async (timestamp: number) => {
  const unixTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));

  const data = await fetchURL(`https://api.hyperbloom.xyz/stats?timestamp=${timestamp}`);

  return {
    dailyVolume: data?.volume24h,
    totalVolume: data?.cumulativeVolume,
    timestamp: unixTimestamp,
  };
};

const adapter: any = {
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch: fetch,
      start: "2025-05-31",
      meta: {
        methodology: {
          Volume: 'Get volume data from HyperBloom project api.'
        }
      }
    },
  },
};

export default adapter;
