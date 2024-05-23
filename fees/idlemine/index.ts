import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

// Define the interface for the data you expect to receive from the API.
interface DailyStats {
  timestamp: number;
  totalFees: number;
  totalRevenue: number;
}

/**
 * Fetches and processes daily stats from a specific endpoint.
 * @param timestampSeconds The timestamp at the start of the day in seconds.
 * @returns A promise that resolves to the daily stats.
 */
const fetchDailyStats = async (timestampSeconds: number): Promise<DailyStats> => {
  const url = "https://api.idlemine.io/api/admin/user/revenue";
  try {
    const response = await fetchURL(url);
    const { Fee, Totalrevenue } = response.data; // Adjust these keys based on the actual API response structure

    return {
      timestamp: timestampSeconds,
      totalRevenue: Totalrevenue,
      totalFees: Fee,
    
    };
  } catch (error) {
    console.error("Failed to fetch daily stats:", error);
    throw new Error("Error fetching daily stats");
  }
};

/**
 * Adapter configuration for fetching daily fees and revenues.
 */
const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch: fetchDailyStats,
      start: 1709251200, // Example start timestamp in seconds.
      meta: {
        methodology: "Calculates revenues and fees from IdleMine thumb game and IdleMine battle games.",
      },
    },
  },
};

export default adapter;
