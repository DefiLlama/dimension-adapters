import fetchURL from "../utils/fetchURL";
import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";

const LUNA_API_BASE = "https://api.lunarfinance.io";
const BRIDGE_ANALYTICS_ENDPOINT = `${LUNA_API_BASE}/api/analytics/bridge`;

interface LunaAnalyticsResponse {
  success: boolean;
  data: {
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

  const url = `${BRIDGE_ANALYTICS_ENDPOINT}?startTime=${dayTimestamp}&endTime=${nextDayTimestamp}`;
  const response: LunaAnalyticsResponse = await fetchURL(url);

  if (!response.success) {
    throw new Error("Failed to fetch Luna Finance bridge analytics");
  }

  const { dailyFees, dailyRevenue } = response.data;

  return {
    dailyFees: dailyFees ? weiToNumber(dailyFees.usd) : 0,
    dailyRevenue: dailyRevenue ? weiToNumber(dailyRevenue.usd) : 0,
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: '2025-05-01',
    },
  },
};

export default adapter;