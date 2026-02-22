import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getEnv } from "../../helpers/env";
import { httpGet } from "../../utils/fetchURL";

const API_URL = "https://api.mainnet.aptoslabs.com/decibel/api/v1/daily_stats";

interface DailyStatsResponse {
  daily_volume: number;
  daily_fees: number;
  daily_revenue: number;
  open_interest: number;
}

const fetch = async (options: FetchOptions) => {
  const url = `${API_URL}?start_timestamp=${options.startTimestamp}&end_timestamp=${options.endTimestamp}`;
  const data: DailyStatsResponse = await httpGet(url, {
    headers: { Authorization: `Bearer ${getEnv("DECIBEL_API_KEY")}` },
  });

  return {
    dailyFees: data.daily_fees,
    dailyUserFees: data.daily_fees,
    dailyRevenue: data.daily_revenue,
  };
};

const methodology = {
  Fees: "Trading fees collected from takers on all perpetual futures markets.",
  UserFees: "Total fees paid by traders on the platform.",
  Revenue: "Net protocol revenue after maker rebates.",
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.APTOS]: {
      fetch,
      start: "2026-02-10",
    },
  },
  methodology,
};

export default adapter;
