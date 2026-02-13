import fetchURL from "../../utils/fetchURL";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const LUNA_API_BASE = process.env.LUNA_API_BASE ?? "https://api.lunarfinance.io";
const SWAP_ANALYTICS_ENDPOINT = `${LUNA_API_BASE}/api/analytics/dexs`;

interface LunaAnalyticsResponse {
  success: boolean;
  data: {
    dailySwapVolume?: {
      usd: string;
    };
    dailyFees?: {
      usd: string;
    };
    dailyRevenue?: {
      usd: string;
    };
  };
}

const weiToNumber = (weiString: string): number => {
  const parsed = parseFloat(weiString);
  return isNaN(parsed) ? 0 : parsed / 1e18;
};

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const nextDayTimestamp = dayTimestamp + 86400;

  const url = `${SWAP_ANALYTICS_ENDPOINT}?startTime=${dayTimestamp}&endTime=${nextDayTimestamp}`;
  const response: LunaAnalyticsResponse = await fetchURL(url);

  if (!response.success) {
    throw new Error("Failed to fetch Luna Finance swap analytics");
  }

  const { dailySwapVolume, dailyFees, dailyRevenue } = response.data;

  return {
    dailyVolume: dailySwapVolume ? weiToNumber(dailySwapVolume.usd) : 0,
    dailyFees: dailyFees ? weiToNumber(dailyFees.usd) : 0,
    dailyRevenue: dailyRevenue ? weiToNumber(dailyRevenue.usd) : 0,
    timestamp: dayTimestamp,
  };
};

const START_TIMESTAMP = 1746057600;

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: START_TIMESTAMP,
    },
  },
};

export default adapter;