import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

interface ApiResponse {
  DATE: string;
  GROSS_AMOUNT_USD: number;
}

const api = "https://app.near-intents.org/api/stats/trading_volume";

const fetch = async (_a: any, _b: any, options: FetchOptions): Promise<FetchResult> => {
  const res = await fetchURL(api);
  const data: ApiResponse[] = Array.isArray(res) ? res : res?.data || [];

  const normalizedDate = options.dateString; // YYYY-MM-DD format
  
  // Find matching record for the date
  const record = data.find((t: ApiResponse) => {
    const recordDate = new Date(t.DATE).toISOString().split("T")[0];
    return recordDate === normalizedDate;
  });

  // Optionally get total volume (if the API returns cumulative data)
  const totalVolume = data.reduce((acc, t) => acc + (t.GROSS_AMOUNT_USD || 0), 0);

  return {
    dailyVolume: record?.GROSS_AMOUNT_USD ?? 0,
    totalVolume,
    timestamp: options.toTimestamp,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.NEAR]: {
      fetch,
      start: 1730764800, // 2024-11-05 UTC
    },
  },
};

export default adapter;
