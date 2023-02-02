import { Adapter, FetchResult } from "../adapters/types";
import { getTimestampAtStartOfPreviousDayUTC } from "../utils/date";
import axios from "axios";

interface DailyFeeResponse {
  fees: {
    dailyFees: number;
    dailyRevenue: number;
  };
}

const fetch = (chain: string) => {
  return async (timestamp: number): Promise<FetchResult> => {
    const response = await axios.get<DailyFeeResponse>(
      `https://edge.stride.zone/api/${chain}/stats/fees`
    );

    return {
      timestamp: timestamp,
      dailyFees: String(response.data.fees.dailyFees),
      dailyRevenue: String(response.data.fees.dailyRevenue),
    };
  };
};

const meta = {
  methodology: {
    Fees: "Fees are staking rewards earned by tokens staked with Stride. They are measured across Stride's LSD tokens' yields and converted to USD terms.",
    Revenue:
      "Stride collects 10% of liquid staked assets's staking rewards. These fees are measured across Stride's LSD tokens' yields and converted to USD terms.",
  },
};

// What value can we pur for the `start` field?

const adapter: Adapter = {
  adapter: {
    cosmos: {
      fetch: fetch("cosmos"),
      runAtCurrTime: true,
      start: async () => 0,
      meta,
    },
    osmosis: {
      fetch: fetch("osmosis"),
      runAtCurrTime: true,
      start: async () => 0,
      meta,
    },
    juno: {
      fetch: fetch("juno"),
      runAtCurrTime: true,
      start: async () => 0,
      meta,
    },
    stargaze: {
      fetch: fetch("stargaze"),
      runAtCurrTime: true,
      start: async () => 0,
      meta,
    },
  },
};

export default adapter; // yarn test fees stride
