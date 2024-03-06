import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
const {
  getChainVolume,
} = require("../../helpers/getUniSubgraphVolume");

const endpoints = {
  [CHAIN.EVMOS]: "https://subgraph.satsuma-prod.com/09c9cf3574cc/orbital-apes/v3-subgraph/api",
};

const v1Graph = getChainVolume({
  graphUrls: endpoints,
  totalVolume: {
    factory: "factories",
    field: "totalVolumeUSD",
  },
  dailyVolume: {
    factory: "uniswapDayData",
    field: "volumeUSD"
  },
});


const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.EVMOS]: {
      fetch: v1Graph(CHAIN.EVMOS),
      start: 1680480000,
    }
  },
};

export default adapter;
