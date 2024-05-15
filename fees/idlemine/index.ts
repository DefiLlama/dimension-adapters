import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import CryptoJS from 'crypto-js';

// Define the interface for the data you expect to receive from the API.
interface DailyStats {
  feesUSDT: number;
}

/**
 * Fetches and decrypts daily stats from a specific endpoint.
 * @param timestampSeconds The timestamp at the start of the day in seconds.
 * @returns A promise that resolves to the fees in USDT.
 */
const fetchDailyStats = async (timestampSeconds: number): Promise<DailyStats> => {
  const url = "https://adminapi.idlemine.io/api/admin/user/dashboard/data";
  const response = await fetchURL(url);
  
  
  const key = 'FakyR%9^rhnRLEwqg4TTBN*bIQ6*h%Jt';
  const bytes = CryptoJS.AES.decrypt(response.data, key);
  const originalText = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
  
  const Revenues = originalText.totaldeposit + originalText.totalwithdrawcharge
  

  return {
    feesUSDT: Revenues // Assuming the decrypted text contains a feesUSDT field
  };
};

/**
 * Fetches the daily fees and adds them to the balances.
 * @param timestampSeconds The current timestamp in seconds.
 * @param options FetchOptions containing utility functions and additional info.
 * @returns An object containing the timestamp and daily fees.
 */
const fetch = async (timestampSeconds: number, _: any, options: FetchOptions) => {
  const dailyRevenue = options.createBalances();
  const today = getTimestampAtStartOfDayUTC(timestampSeconds);
  const statsApiResponse = await fetchDailyStats(today);
  dailyRevenue.add('0x55d398326f99059fF775485246999027B3197955', statsApiResponse.feesUSDT * 1e18);
  
  return {
    timestamp: timestampSeconds,
    dailyRevenue,
  };
};

const adapter: Adapter = {
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
