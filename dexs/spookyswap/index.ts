import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getStartTimestamp } from "../../helpers/getStartTimestamp";
import { DEFAULT_DAILY_VOLUME_FIELD, DEFAULT_TOTAL_VOLUME_FIELD, getChainVolume } from "../../helpers/getUniSubgraphVolume";

const { getChainVolumeWithGasToken } = require("../../helpers/getUniSubgraphVolume");
const { FANTOM } = require("../../helpers/chains");
const endpoints = {
  [FANTOM]: "https://api.thegraph.com/subgraphs/name/eerieeight/spookyswap",
  [CHAIN.EON]: "https://eon-graph.horizenlabs.io/subgraphs/name/0xALUKARD/spookyswap-eon",
  [CHAIN.BITTORRENT]: "https://subgraph.spook.fi/subgraphs/name/eerieeight/spooky-swap-new"
};

const graphs = getChainVolumeWithGasToken({
  graphUrls: {
    [FANTOM]: endpoints[FANTOM],
  },
  priceToken: "coingecko:fantom"
});

const graphsV3 = getChainVolume({
  graphUrls: {
    [CHAIN.EON]: endpoints[CHAIN.EON],
    [CHAIN.BITTORRENT]: endpoints[CHAIN.BITTORRENT]
  },
  dailyVolume: {
    factory: "uniswapDayData",
    field: DEFAULT_DAILY_VOLUME_FIELD,
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
    [CHAIN.BITTORRENT]: {
      fetch: graphsV3(CHAIN.BITTORRENT),
      start:  23534368
    },
  },
};

export default adapter;
