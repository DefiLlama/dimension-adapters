import { FetchResult, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

let res: any
const url = "https://app.astroport.fi/api/trpc/protocol.stats?input=%7B%22json%22%3A%7B%22chains%22%3A%5B%22phoenix-1%22%2C%22neutron-1%22%5D%7D%7D"
const fetch = (chainId: string) => {
  return async (): Promise<FetchResult> => {
    if (!res) res = fetchURL(url)
    const results = (await res).result.data.json.chains[chainId];
    return {
      dailyVolume: results.dayVolumeUSD,
      dailyFees: results.dayLpFeesUSD,
      dailyRevenue: 0,
    };
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  runAtCurrTime: true,
  adapter: {
    terra2: {
      fetch: fetch("phoenix-1"),
    },
    // deprecated: https://github.com/DefiLlama/dimension-adapters/issues/5116#issuecomment-3660619459
    // [CHAIN.INJECTIVE]: {
    //   fetch: fetch("injective-1"),
    // },
    neutron: {
      fetch: fetch("neutron-1"),
    },
    // [CHAIN.SEI]: {
    //   fetch: fetch("pacific-1"),
    // },
    // [CHAIN.OSMOSIS]: {
    //   fetch: fetch("osmosis-1"),
    // },
  },
};

export default adapter;
