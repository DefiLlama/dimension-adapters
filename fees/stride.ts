import { Adapter, FetchResult } from "../adapters/types";
import axios from "axios";
import { CHAIN } from "../helpers/chains";

interface DailyFeeResponse {
  fees: {
    dailyFees: number;
    dailyRevenue: number;
  };
}

const chainOverrides: { [key: string]: string } = {
  "terra": "terra2",
};

const fetch = (chain: string) => {
  return async (timestamp: number): Promise<FetchResult> => {
    const overriddenChain = chainOverrides[chain] || chain; // Override if exists, else use original
    const response = await axios.get<DailyFeeResponse>(
      `https://edge.stride.zone/api/${overriddenChain}/stats/fees`
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

const adapter: Adapter = {
  adapter: {
    [CHAIN.COSMOS]: {
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
    terra: {
      fetch: fetch("terra"),
      runAtCurrTime: true,
      start: async () => 0,
      meta,
    },
      evmos: {
       fetch: fetch("evmos"),
       runAtCurrTime: true,
       start: async () => 0,
       meta,
     },
     injective: {
       fetch: fetch("injective"),
       runAtCurrTime: true,
       start: async () => 0,
       meta,
     }, 
     umee: {
       fetch: fetch("umee"),
       runAtCurrTime: true,
       start: async () => 0,
       meta,
     }, 
  },
};

export default adapter; // yarn test fees stride
