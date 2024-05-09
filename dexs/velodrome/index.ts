import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { DEFAULT_DAILY_VOLUME_FIELD, DEFAULT_TOTAL_VOLUME_FIELD, getChainVolume } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";

const endpoints = {
  [CHAIN.OPTIMISM]: "https://api.thegraph.com/subgraphs/name/dmihal/velodrome",
};

const graphs = getChainVolume({
  graphUrls: endpoints,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: "dayData",
    field: DEFAULT_DAILY_VOLUME_FIELD,
  },
});


const fetch = (chain: Chain) => {
  return async (options: FetchOptions) => {
    const [v1] = await Promise.all([graphs(chain)(options)])
    const dailyVolume = Number(v1.dailyVolume);
    return {
      dailyVolume: `${dailyVolume}`,
    }
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.OPTIMISM]: {
      fetch: fetch(CHAIN.OPTIMISM),
      start: 1677110400
    },
  },
};

export default adapter;
