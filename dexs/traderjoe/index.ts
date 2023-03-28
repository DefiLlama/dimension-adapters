import { BreakdownAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getChainVolume } from "../../helpers/getUniSubgraphVolume";

const endpoints = {
  [CHAIN.AVAX]: "https://api.thegraph.com/subgraphs/name/traderjoe-xyz/exchange",
};
const endpointsV2 = {
  [CHAIN.AVAX]: "https://api.thegraph.com/subgraphs/name/traderjoe-xyz/joe-v2",
  [CHAIN.ARBITRUM]: "https://api.thegraph.com/subgraphs/name/traderjoe-xyz/joe-v2-arbitrum",
  [CHAIN.BSC]: "https://api.thegraph.com/subgraphs/name/traderjoe-xyz/joe-v2-bnb"
}


const graphsV1 = getChainVolume({
  graphUrls: endpoints,
  totalVolume: {
    factory: "factories",
    field: "volumeUSD",
  },
  dailyVolume: {
    factory: "dayData",
    field: "volumeUSD",
    dateField: "date"
  },
});


const graphsV2 = getChainVolume({
  graphUrls: endpointsV2,
  totalVolume: {
    factory: "lbfactories",
    field: "volumeUSD",
  },
  dailyVolume: {
    factory: "traderJoeDayData",
    field: "volumeUSD",
    dateField: "date"
  },
});

const adapter: BreakdownAdapter = {
  breakdown: {
    v1: {
      [CHAIN.AVAX]: {
        fetch: graphsV1(CHAIN.AVAX),
        start: async () => 1628467200,
      },
    },
    v2: {
      [CHAIN.AVAX]: {
        fetch: graphsV2(CHAIN.AVAX),
        start: async () => 1668556800
      },
      [CHAIN.ARBITRUM]: {
        fetch: graphsV2(CHAIN.ARBITRUM),
        start: async () => 1671926400
      },
      [CHAIN.BSC]: {
        fetch: graphsV2(CHAIN.BSC),
        start: async () => 1677715200
      },
    }
  },
};

export default adapter;
