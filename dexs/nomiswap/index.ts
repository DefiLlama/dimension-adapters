import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { getGraphDimensions } from "../../helpers/getUniSubgraph";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { time } from "console";

const endpoints = {
  [CHAIN.BSC]: "https://api.thegraph.com/subgraphs/name/chopachom/nomiswap-subgraph-exchange",
};

const VOLUME_FIELD = "dailyVolumeUSD";
const blacklistTokens = {
  [CHAIN.BSC]: [
    "0x7f9ad7a5854658d984924e868187b2135514fb88"
  ]
}
const graphsClassic = getGraphDimensions({
  graphUrls: endpoints,
  totalVolume: {
    factory: "nomiswapFactories",
    field: "totalVolumeUSD",
  },
  dailyVolume: {
    factory: "nomiswapDayData",
    field: VOLUME_FIELD,
  },
  blacklistTokens
});

const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch: async (options: FetchOptions) => {
        const data = await graphsClassic(CHAIN.BSC)(options);
        const removeSpike = Number(data.totalVolume) - 2035654137.527446631277942307129497;
        data.totalVolume = removeSpike > 0 ? removeSpike : data.totalVolume;
        return {
          ...data
        }
      },
      start: 1634710338,
    }
  }
}

export default adapters
