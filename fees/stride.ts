import { Adapter, FetchResult } from "../adapters/types";
import { getTimestampAtStartOfPreviousDayUTC } from "../utils/date";
import axios from "axios";

interface DailyFeeResponse {
  fees: { dailyFees: number };
}

const fetch = (chain: string) => {
  return async (timestamp: number): Promise<FetchResult> => {
    const response = await axios.get<DailyFeeResponse>(
      `https://edge.stride.zone/api/${chain}/stats/fees`
    );

    return {
      timestamp: timestamp,
      dailyFees: String(response.data.fees.dailyFees),
    };
  };
};

const meta = {
  methodology: {
    Fees: "Stride collects a 10% fee on liquid staked asset staking yield.",
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
