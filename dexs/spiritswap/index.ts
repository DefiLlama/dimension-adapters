import { SimpleAdapter } from "../../adapters/types";

const {
  getChainVolumeWithGasToken,
} = require("../../helpers/getUniSubgraphVolume");

const endpoints = {
  fantom:
    "https://api.thegraph.com/subgraphs/name/layer3org/spiritswap-analytics",
};

const graphs = getChainVolumeWithGasToken({
  graphUrls: {
    fantom: endpoints.fantom,
  },
  totalVolume: {
    factory: "spiritswapFactories",
    field: 'totalVolumeFTM',
  },
  dailyVolume: {
    factory: "spiritswapDayData",
    field: 'dailyVolumeFTM',
  },
  priceToken: "coingecko:fantom"
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    fantom: {
      fetch: graphs("fantom"),
      start: 1620864000,
    },
  },
};

export default adapter;
