import { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const URL_FLARE = "http://flare.index.enosys.global/v1/public/24hourV3Volume";

const fetchVolume: FetchV2 = async (options: FetchOptions) => {
  const dailyVolume = await fetchURL(URL_FLARE);

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.FLARE]: {
      fetch: fetchVolume,
      start: 1741023000,
    },
  },
};

export default adapter;
