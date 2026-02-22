import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getEnv } from "../../helpers/env";
import { httpGet } from "../../utils/fetchURL";

const API_URL = "https://api.mainnet.aptoslabs.com/decibel/api/v1/daily_stats";

interface DailyStatsResponse {
  dailyVolume: number;
  dailyFees: number;
  dailyRevenue: number;
  openInterest: number;
}

const fetch = async (options: FetchOptions) => {
  const url = `${API_URL}?start_timestamp=${options.startTimestamp}&end_timestamp=${options.endTimestamp}`;
  const data: DailyStatsResponse = await httpGet(url, {
    headers: { Authorization: `Bearer ${getEnv("DECIBEL_API_KEY")}` },
  });

  return {
    dailyVolume: data.dailyVolume,
    dailyFees: data.dailyFees,
    dailyUserFees: data.dailyFees,
    dailyRevenue: data.dailyRevenue,
    openInterestAtEnd: data.openInterest,
  };
};

const methodology = {
  Volume: "Sum of notional value of all taker fills across perpetual futures markets.",
  Fees: "Trading fees collected from takers on all perpetual futures markets.",
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
