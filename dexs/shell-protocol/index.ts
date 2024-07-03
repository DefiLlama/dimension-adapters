import { ChainBlocks, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getVolume } from "./helpers";

const fetch = async (timestamp: number, _: ChainBlocks, options: FetchOptions) => {
  const dailyVolume = await getVolume(timestamp);
  return { timestamp, dailyVolume };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: 1705968000,
    },
  },
};

export default adapter;
