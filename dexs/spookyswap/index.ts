import * as sdk from "@defillama/sdk";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getStartTimestamp } from "../../helpers/getStartTimestamp";
import { DEFAULT_TOTAL_VOLUME_FIELD, getChainVolume2, getChainVolumeWithGasToken2 } from "../../helpers/getUniSubgraphVolume";
const { FANTOM } = require("../../helpers/chains");

const endpoints = {
  [FANTOM]: sdk.graph.modifyEndpoint('HyhMfT7gehNHMBmFiExqeg3pDtop9UikjvBPfAXT3b21'),
  [CHAIN.EON]: "https://eon-graph.horizenlabs.io/subgraphs/name/0xALUKARD/spookyswap-eon",
  // [CHAIN.BITTORRENT]: "https://subgraph.spook.fi/subgraphs/name/eerieeight/spooky-swap-new"
};

const graphs = getChainVolumeWithGasToken2({
  graphUrls: {
    [FANTOM]: endpoints[FANTOM],
  },
  priceToken: "coingecko:fantom",
  totalVolume: {
    factory: "uniswapFactories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
});

const graphsV3 = getChainVolume2({
  graphUrls: {
    [CHAIN.EON]: endpoints[CHAIN.EON],
    // [CHAIN.BITTORRENT]: endpoints[CHAIN.BITTORRENT]
  },
  totalVolume: {
    factory: "uniswapFactories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  }
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [FANTOM]: {
      fetch: graphs(FANTOM),
      start: getStartTimestamp({
        endpoints,
        chain: FANTOM
      }),
    },
    [CHAIN.EON]: {
      fetch: graphsV3(CHAIN.EON),
      start:  1698969600
    },
    // [CHAIN.BITTORRENT]: {
    //   fetch: graphsV3(CHAIN.BITTORRENT),
    //   start:  23534368
    // },
  },
};

export default adapter;
