import * as sdk from "@defillama/sdk";
import { BreakdownAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { DEFAULT_TOTAL_VOLUME_FACTORY, DEFAULT_TOTAL_VOLUME_FIELD, getChainVolume, getChainVolume2 } from "../../helpers/getUniSubgraphVolume";

const endpoints = {
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('3g83GYhbyHtjy581vpTmN1AP9cB9MjWMh5TiuNpvTU4R'),
};

const graphs = getChainVolume2({
  graphUrls: endpoints,
  totalVolume: {
    factory: DEFAULT_TOTAL_VOLUME_FACTORY,
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
});

const endpointsV3 = {
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('7ZP9MeeuXno2y9pWR5LzA96UtYuZYWTA4WYZDZR7ghbN'),
};
const graphsV3 = getChainVolume2({
  graphUrls: endpointsV3,
  totalVolume: {
    factory: "factories",
    field: "totalVolumeUSD",
  },
});

const endpointsStable = {
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('H7QEsa69B3bbXZVtmqGaRZVUV8PCUqsKfqXGRb69LHa6')
};

const graphsStable = getChainVolume2({
  graphUrls: endpointsStable,
  totalVolume: {
    factory: "tradeVolumes",
    field: "volume",
  },
});


const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    v2: {
      [CHAIN.ARBITRUM]: {
        fetch: graphs(CHAIN.ARBITRUM),
        start: '2023-01-23'
      },
    },
    v3: {
      [CHAIN.ARBITRUM]: {
        fetch: graphsV3(CHAIN.ARBITRUM),
        start: '2023-02-20'
      },
    },
    stable: {
      [CHAIN.ARBITRUM]: {
        fetch: graphsStable(CHAIN.ARBITRUM),
        start: '2023-02-11',
      },
    }
  },
};

export default adapter;
