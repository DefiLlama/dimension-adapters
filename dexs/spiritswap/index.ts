import { SimpleAdapter } from "../../adapters/types";
import * as sdk from "@defillama/sdk";
import { getChainVolumeWithGasToken2 } from "../../helpers/getUniSubgraphVolume";

const endpoints = {
  fantom: sdk.graph.modifyEndpoint('E6viiLSqVvjLy9re7aBPkaXAB2itNDho2LR3CP2q1uqP'),
};

const graphs = getChainVolumeWithGasToken2({
  graphUrls: {
    fantom: endpoints.fantom,
  },
  totalVolume: {
    factory: "spiritswapFactories",
    field: 'totalVolumeFTM',
  },
  priceToken: "coingecko:fantom"
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    fantom: {
      fetch: graphs("fantom"),
      start: '2021-05-13',
    },
  },
};

export default adapter;
