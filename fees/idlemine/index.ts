import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";


// Define the interface for the data you expect to receive from the API.
interface DailyStats {
  feesUSDT: number;
  revenueUSDT:number
}

/**
 * Fetches and decrypts daily stats from a specific endpoint.
 * @param timestampSeconds The timestamp at the start of the day in seconds.
 * @returns A promise that resolves to the fees in USDT.
 */
const fetchDailyStats = async (timestampSeconds: number): Promise<DailyStats> => {
  const url = "https://api.idlemine.io/api/admin/user/revenue";
  const response = await fetchURL(url);
  
  
  const Revenues = response.data
  return {
    
    feesUSDT: Revenues.Fee,
    revenueUSDT: Revenues.Totalrevenue,
  }
};

/**
 * Fetches the daily fees and adds them to the balances.
 * @param timestampSeconds The current timestamp in seconds.
 * @param options FetchOptions containing utility functions and additional info.
 * @returns An object containing the timestamp and daily fees.
 */
const fetch = async (timestampSeconds: number, _: any, options: FetchOptions) => {
  const totalRevenue = options.createBalances();
  const totalFees = options.createBalances();
  const today = getTimestampAtStartOfDayUTC(timestampSeconds);
  const statsApiResponse = await fetchDailyStats(today);
  totalRevenue.add('0x55d398326f99059fF775485246999027B3197955', statsApiResponse.revenueUSDT * 1e18);
  totalFees.add('0x55d398326f99059fF775485246999027B3197955', statsApiResponse.feesUSDT * 1e18);
  
  return {
    timestamp: timestampSeconds,
    totalRevenue,
    totalFees
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      start: 1709251200, // Start timestamp in seconds.
      meta: {
        methodology: "idlemine revenue from idlemine thumb game and idlemine battle games",
      },
    },
  },
};

export default adapter;
