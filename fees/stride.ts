import { Adapter, FetchResult } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

interface DailyFeeResponse {
  fees: {
    dailyFees: number;
    dailyRevenue: number;
  };
}

const chainOverrides: { [key: string]: string } = {
  terra: "terra2",
};

const fetch = (chain: string) => {
  return async (timestamp: number): Promise<FetchResult> => {
    const overriddenChain = chainOverrides[chain] || chain; // Override if exists, else use original
    const response: DailyFeeResponse = await httpGet(
      `https://edge.stride.zone/api/${overriddenChain}/stats/fees`
    );

    return {
      timestamp: timestamp,
      dailyFees: String(response.fees.dailyFees),
      dailyRevenue: String(response.fees.dailyRevenue),
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
            meta,
    },
    celestia: {
      fetch: fetch("celestia"),
      runAtCurrTime: true,
            meta,
    },
    osmosis: {
      fetch: fetch("osmosis"),
      runAtCurrTime: true,
            meta,
    },
    dydx: {
      fetch: fetch("dydx"),
      runAtCurrTime: true,
            meta,
    },
    dymension: {
      fetch: fetch("dymension"),
      runAtCurrTime: true,
            meta,
    },
    juno: {
      fetch: fetch("juno"),
      runAtCurrTime: true,
            meta,
    },
    stargaze: {
      fetch: fetch("stargaze"),
      runAtCurrTime: true,
            meta,
    },
    terra: {
      fetch: fetch("terra"),
      runAtCurrTime: true,
            meta,
    },
    evmos: {
      fetch: fetch("evmos"),
      runAtCurrTime: true,
            meta,
    },
    injective: {
      fetch: fetch("injective"),
      runAtCurrTime: true,
            meta,
    },
    umee: {
      fetch: fetch("umee"),
      runAtCurrTime: true,
            meta,
    },
    comdex: {
      fetch: fetch("comdex"),
      runAtCurrTime: true,
            meta,
    },
    haqq: {
      fetch: fetch("haqq"),
      runAtCurrTime: true,
            meta,
    },
    band: {
      fetch: fetch("band"),
      runAtCurrTime: true,
            meta,
    },
  },
};

export default adapter; // yarn test fees stride
