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

const info = {
  methodology: {
    Fees: "Fees are staking rewards earned by tokens staked with Stride. They are measured across Stride's LSD tokens' yields and converted to USD terms.",
    Revenue:
      "Stride collects 10% of liquid staked assets's staking rewards. These fees are measured across Stride's LSD tokens' yields and converted to USD terms.",
  },
};

const adapter: Adapter = {
  runAtCurrTime: true,
  methodology: info.methodology,
  adapter: {
    [CHAIN.COSMOS]: { fetch: fetch("cosmos"), },
    celestia: { fetch: fetch("celestia"), },
    osmosis: { fetch: fetch("osmosis"), },
    dydx: { fetch: fetch("dydx"), },
    dymension: { fetch: fetch("dymension"), },
    juno: { fetch: fetch("juno"), },
    stargaze: { fetch: fetch("stargaze"), },
    terra: { fetch: fetch("terra"), },
    evmos: { fetch: fetch("evmos"), },
    injective: { fetch: fetch("injective"), },
    umee: { fetch: fetch("umee"), },
    comdex: { fetch: fetch("comdex"), },
    islm: { fetch: fetch("haqq"), },
    band: { fetch: fetch("band"), },
  },
};

export default adapter; // yarn test fees stride
