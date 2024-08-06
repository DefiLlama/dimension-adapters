import { SimpleAdapter } from "../../adapters/types";
import * as sdk from "@defillama/sdk";

const {
  getChainVolumeWithGasToken,
} = require("../../helpers/getUniSubgraphVolume");

const endpoints = {
  fantom: sdk.graph.modifyEndpoint('E6viiLSqVvjLy9re7aBPkaXAB2itNDho2LR3CP2q1uqP'),
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
