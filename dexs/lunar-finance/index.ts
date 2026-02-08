import fetchURL from "../../utils/fetchURL";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

// Luna Finance API endpoints

const LUNA_API_BASE = "https://api.lunarfinance.io"; // Replace with your actual API URL
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

interface TimeSeriesPoint {
  timestamp: number;
  volume: string;
  fees: string;
  transactions: number;
}

interface TimeSeriesResponse {
  success: boolean;
  data: {
    timeSeries: TimeSeriesPoint[];
  };
}

// Helper to convert wei-like format to number
const weiToNumber = (weiString: string): number => {
  return parseFloat(weiString) / 1e18;
};

// Fetch combined bridge + swap volume for a specific day
const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const nextDayTimestamp = dayTimestamp + 86400; // +24 hours

  try {
    // Fetch analytics for the specific day
    const url = `${COMBINED_ANALYTICS_ENDPOINT}?startTime=${dayTimestamp}&endTime=${nextDayTimestamp}`;
    const response: LunaAnalyticsResponse = await fetchURL(url);

    if (!response.success) {
      throw new Error("Failed to fetch Luna Finance analytics");
    }

    const { dailyBridgeVolume, dailySwapVolume, dailyFees, dailyRevenue } = response.data;

    // Combine bridge and swap volumes
    const bridgeVol = dailyBridgeVolume ? weiToNumber(dailyBridgeVolume.usd) : 0;
    const swapVol = dailySwapVolume ? weiToNumber(dailySwapVolume.usd) : 0;
    const totalVolume = bridgeVol + swapVol;

    const totalFees = dailyFees ? weiToNumber(dailyFees.usd) : 0;
    const totalRevenue = dailyRevenue ? weiToNumber(dailyRevenue.usd) : 0;

    return {
      dailyVolume: totalVolume,
      dailyBridgeVolume: bridgeVol,
      dailySwapVolume: swapVol,
      dailyFees: totalFees,
      dailyRevenue: totalRevenue,
      timestamp: dayTimestamp,
    };
  } catch (error) {
    console.error(`Error fetching Luna Finance data for timestamp ${timestamp}:`, error);
    return {
      dailyVolume: 0,
      timestamp: dayTimestamp,
    };
  }
};

// Fetch bridge-only volume
const fetchBridge = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const nextDayTimestamp = dayTimestamp + 86400;

  try {
    const url = `${BRIDGE_ANALYTICS_ENDPOINT}?startTime=${dayTimestamp}&endTime=${nextDayTimestamp}`;
    const response: LunaAnalyticsResponse = await fetchURL(url);

    if (!response.success) {
      throw new Error("Failed to fetch bridge analytics");
    }

    const { dailyBridgeVolume, dailyFees, dailyRevenue } = response.data;

    return {
      dailyVolume: dailyBridgeVolume ? weiToNumber(dailyBridgeVolume.usd) : 0,
      dailyFees: dailyFees ? weiToNumber(dailyFees.usd) : 0,
      dailyRevenue: dailyRevenue ? weiToNumber(dailyRevenue.usd) : 0,
      timestamp: dayTimestamp,
    };
  } catch (error) {
    console.error(`Error fetching bridge data:`, error);
    return {
      dailyVolume: 0,
      timestamp: dayTimestamp,
    };
  }
};

// Fetch swap-only volume
const fetchSwap = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const nextDayTimestamp = dayTimestamp + 86400;

  try {
    const url = `${SWAP_ANALYTICS_ENDPOINT}?startTime=${dayTimestamp}&endTime=${nextDayTimestamp}`;
    const response: LunaAnalyticsResponse = await fetchURL(url);

    if (!response.success) {
      throw new Error("Failed to fetch swap analytics");
    }

    const { dailySwapVolume, dailyFees, dailyRevenue } = response.data;

    return {
      dailyVolume: dailySwapVolume ? weiToNumber(dailySwapVolume.usd) : 0,
      dailyFees: dailyFees ? weiToNumber(dailyFees.usd) : 0,
      dailyRevenue: dailyRevenue ? weiToNumber(dailyRevenue.usd) : 0,
      timestamp: dayTimestamp,
    };
  } catch (error) {
    console.error(`Error fetching swap data:`, error);
    return {
      dailyVolume: 0,
      timestamp: dayTimestamp,
    };
  }
};

// Get the start timestamp (when Luna Finance launched)
const getStartTimestamp = async () => {
  try {
    // Fetch historical time series data to find earliest date
    const url = `${LUNA_API_BASE}/api/analytics/timeseries?timeRange=all&granularity=day`;
    const response: TimeSeriesResponse = await fetchURL(url);

    if (!response.success || !response.data.timeSeries.length) {
      // Fallback to a default launch date if API fails
      return 1640995200; // January 1, 2022 (replace with actual launch date)
    }

    // Return the earliest timestamp from historical data
    return response.data.timeSeries[0].timestamp;
  } catch (error) {
    console.error("Error fetching start timestamp:", error);
    // Fallback date
    return 1640995200;
  }
};

// Main adapter for combined volume (bridges + dexs)
const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: getStartTimestamp,
    },
    // Add support for other chains as Luna Finance expands
    // [CHAIN.ETHEREUM]: {
    //   fetch,
    //   start: getStartTimestamp,
    // },
  },
};

// Bridge-specific adapter
export const bridgeAdapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetchBridge,
      start: getStartTimestamp,
    },
  },
};

// DEX/Swap-specific adapter
export const dexAdapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetchSwap,
      start: getStartTimestamp,
    },
  },
};

export default adapter;