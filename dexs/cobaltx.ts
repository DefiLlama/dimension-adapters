import fetchURL from "../utils/fetchURL";
import { FetchOptions, FetchResult, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const config: any = {
  [CHAIN.SOON]: "https://api.cobaltx.io/main/info",
  [CHAIN.SOON_BSC]: "https://api.svmbnb.cobaltx.io/main/info",
  [CHAIN.SOON_BASE]: "https://api.soonbase.cobaltx.io/main/info",
}

const fetch = async (_: any, _1: any, { chain }: FetchOptions): Promise<FetchResult> => {
  const response = await fetchURL(config[chain]);
  return {
    dailyVolume: response.data.volume24,
  };
};

const adapter: SimpleAdapter = {
  runAtCurrTime: true,
  chains: Object.keys(config),
  fetch,
  adapter: {},
};

export default adapter;
