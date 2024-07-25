import * as sdk from "@defillama/sdk";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { getGraphDimensions } from "../../helpers/getUniSubgraph";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { time } from "console";

const endpoints = {
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('9ggB4DiKGyXfiS4vh1xqQJMcTQEvxxt715HVm8S3r27G'),
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
  adapter: {
    [CHAIN.BSC]: {
      fetch: async (timestamp, chainBlocks) => {
        const data = await graphsClassic(CHAIN.BSC)(timestamp, chainBlocks);
        const removeSpike = Number(data.totalVolume) - 7035654137.527446631277942307129497;
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
