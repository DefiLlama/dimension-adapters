import fetchURL from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const { startOfDay } = options;
  const data = await fetchURL(
    `https://api.opinion.trade/api/v2/statistics/volume?startOfDay=${startOfDay}&chainId=56`
  );
  const {
    result: { dailyVolume },
  } = data;
  return {
    dailyVolume: dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      start: "2025-10-21",
    },
  },
};

export default adapter;
