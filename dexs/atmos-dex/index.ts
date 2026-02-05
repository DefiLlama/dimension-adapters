import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const API_ENDPOINT = "https://api.atmos.ag/stats/defillama/stats";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const response = await httpGet(
    `${API_ENDPOINT}?timestamp=${options.startOfDay}`
  );

  return {
    dailyVolume: response.data.dex.volume,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SUPRA]: {
      fetch,
      start: "2025-09-23",
    },
  },
};

export default adapter;
