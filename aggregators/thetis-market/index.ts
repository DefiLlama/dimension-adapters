import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const endpoint = "https://api.thetis.market/indexer/v1/stats/";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const startTime = options.startOfDay;
  const endTime = startTime + 86400;

  const [{ swap } = { swap: 0 }] = [] = await fetchURL(`${endpoint}volume-daily?startTime=${startTime}&endTime=${endTime}`);

  return {
    dailyVolume: swap / 1e18
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.APTOS]: {
      fetch,
      start: "2024-08-09"
    },
  },
};

export default adapter;
