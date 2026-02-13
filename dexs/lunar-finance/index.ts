import fetchURL from "../../utils/fetchURL";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const LUNA_API_BASE = "https://api.lunarfinance.io";
const BRIDGE_ANALYTICS_ENDPOINT = `${LUNA_API_BASE}/api/analytics/bridge`;
const SWAP_ANALYTICS_ENDPOINT = `${LUNA_API_BASE}/api/analytics/dexs`;
const COMBINED_ANALYTICS_ENDPOINT = `${LUNA_API_BASE}/api/analytics/fees`;

interface LunaAnalyticsResponse {
  success: boolean;
  data: {
    dailyBridgeVolume?: {
      usd: string;
    };
    dailySwapVolume?: {
      usd: string;
    };
    dailyFees?: {
      usd: string;
    };
    dailyRevenue?: {
      usd: string;
    };
    metadata?: {
      timeframe: {
        start: number;
        end: number;
      };
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

  const url = `${COMBINED_ANALYTICS_ENDPOINT}?startTime=${dayTimestamp}&endTime=${nextDayTimestamp}`;
  const response: LunaAnalyticsResponse = await fetchURL(url);

  if (!response.success) {
    throw new Error("Failed to fetch Luna Finance analytics");
  }

  const { dailyBridgeVolume, dailySwapVolume, dailyFees, dailyRevenue } = response.data;

  const bridgeVol = dailyBridgeVolume ? weiToNumber(dailyBridgeVolume.usd) : 0;
  const swapVol = dailySwapVolume ? weiToNumber(dailySwapVolume.usd) : 0;
  const totalVolume = bridgeVol + swapVol;

  const totalFees = dailyFees ? weiToNumber(dailyFees.usd) : 0;
  const totalRevenue = dailyRevenue ? weiToNumber(dailyRevenue.usd) : 0;

  return {
    dailyVolume: totalVolume,
    dailyBridgeVolume: bridgeVol,
    dailyFees: totalFees,
    dailyRevenue: totalRevenue,
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