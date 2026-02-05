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

  const normalizedDate = options.dateString; // YYYY-MM-DD

  const record = data.find((t: ApiResponse) => {
    const recordDate = new Date(t.DATE).toISOString().split("T")[0];
    return recordDate === normalizedDate;
  });

  if (!record) {
    throw new Error(`Near Intents: No volume data found for ${normalizedDate}`);
  }

  return {
    dailyVolume: record.GROSS_AMOUNT_USD,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.NEAR],
  start: "2024-11-05",
};

export default adapter;
