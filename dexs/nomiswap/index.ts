import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { getGraphDimensions2 } from "../../helpers/getUniSubgraph";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";

const endpoints = {
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('9ggB4DiKGyXfiS4vh1xqQJMcTQEvxxt715HVm8S3r27G'),
};

const VOLUME_FIELD = "dailyVolumeUSD";
const blacklistTokens = {
  [CHAIN.BSC]: [
    "0x7f9ad7a5854658d984924e868187b2135514fb88"
  ]
}
const graphsClassic = getGraphDimensions2({
  graphUrls: endpoints,
  totalVolume: {
    factory: "nomiswapFactories",
    field: "totalVolumeUSD",
  },
  blacklistTokens
});

const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch: async (options: FetchOptions) => {
        const data = await graphsClassic(CHAIN.BSC)(options);
        const removeSpike = Number(data.totalVolume) - 7035654137.527446631277942307129497;
        data.totalVolume = removeSpike > 0 ? removeSpike : data.totalVolume;
        return {
          ...data
        }
      },
      start: '2021-10-20',
    }
  }
}

export default adapters
