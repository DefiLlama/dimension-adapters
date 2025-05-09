import fetchURL from "../../utils/fetchURL";
import { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const fetch: FetchV2 = async (options: FetchOptions) => {
  const {startOfDay} = options;
  const data = await fetchURL(`https://api.olab.xyz/api/v2/statistics/volume?startOfDay=${startOfDay}`);
  const {result: {totalVolume, dailyVolume}} = data;
  return {
    totalVolume: totalVolume,
    dailyVolume: dailyVolume
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: "2024-12-19",
    },
  },
};

export default adapter;
