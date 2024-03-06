import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
const {
  getChainVolume
} = require("../../helpers/getUniSubgraphVolume");

const endpoints = {
  [CHAIN.BSC]: "https://api.thegraph.com/subgraphs/name/shahzeb8285/knight-new-graph",
  [CHAIN.FANTOM]: "https://api.thegraph.com/subgraphs/name/shahzeb8285/thedarkknightanalytics",
};

const v2Graph = getChainVolume({
  graphUrls: endpoints,
  totalVolume: {
    factory: "pancakeFactories",
    field: "totalVolumeUSD",
  },
  dailyVolume: {
    factory: "pancakeDayData",
    field: "dailyVolumeUSD",
  },
});


const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch: v2Graph(CHAIN.BSC),
      start: 1635379200,
    },
    [CHAIN.FANTOM]: {
      fetch: v2Graph(CHAIN.FANTOM),
      start: 1637798400,
    },
  },
};

export default adapter;
