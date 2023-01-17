import { Adapter } from "../adapters/types";
import { getTimestampAtStartOfPreviousDayUTC } from "../utils/date";
import axios from "axios";

interface DailyFeeResponse {
  fees: { dailyFees: number };
}

const fetch = (chain: string) => {
  return async (timestamp: number): FetchResult => {
    const response = await axios.get<DailyFeeResponse>(
      `https://stride-app-server-git-main-stride-staging.vercel.app/api/${chain}/stats/fees`
    );

    return {
      timestamp: timestamp,
      dailyFees: String(response.data.fees.dailyFees),
    };
  };
};

// What value can we pur for the `start` field?

const adapter: Adapter = {
  adapter: {
    cosmos: {
      fetch: fetch("cosmos"),
      runAtCurrTime: true,
      start: async () => 0,
    },
    osmosis: {
      fetch: fetch("osmosis"),
      runAtCurrTime: true,
      start: async () => 0,
    },
    juno: {
      fetch: fetch("juno"),
      runAtCurrTime: true,
      start: async () => 0,
    },
    stargaze: {
      fetch: fetch("stargaze"),
      runAtCurrTime: true,
      start: async () => 0,
    },
  },
};

export default adapter;
