import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";
import { fetchV2 } from "./v2";


const fetch = (_: Chain) => {
  return async (timestamp: number) => {
    const [v2] = await Promise.all([fetchV2(timestamp)])
    const dailyVolume = Number(v2.dailyVolume);
    return {
      dailyVolume: `${dailyVolume}`,
      timestamp
    }
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.OPTIMISM]: {
      fetch: fetch(CHAIN.OPTIMISM),
      start: async () => 1677110400
    },
  },
};

export default adapter;
