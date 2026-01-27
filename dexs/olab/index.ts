import fetchURL from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const fetch = async (_a:any, _b:any, options: FetchOptions) => {
  const { startOfDay } = options;
  const data = await fetchURL(`https://api.olab.xyz/api/v2/statistics/volume?startOfDay=${startOfDay}`);
  const {result: { dailyVolume }} = data;
  return {
    dailyVolume: dailyVolume
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: "2024-12-19",
    },
  },
};

export default adapter;
