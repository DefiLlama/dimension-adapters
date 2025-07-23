import * as sdk from "@defillama/sdk";
import { BreakdownAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { DEFAULT_TOTAL_VOLUME_FACTORY, DEFAULT_TOTAL_VOLUME_FIELD, getChainVolume, getChainVolume2 } from "../../helpers/getUniSubgraphVolume";
import { uniV2Exports, uniV3Exports } from "../../helpers/uniswap";

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

const v2Adapter = uniV2Exports({
  [CHAIN.ARBITRUM]: { factory: '0xaC2ee06A14c52570Ef3B9812Ed240BCe359772e7', start: '2023-01-23', fees: 0.0025, protocolRevenueRatio: 0.1,  revenueRatio: 0.1, },
})

/* const v3Adapter = uniV3Exports({
  [CHAIN.ARBITRUM]: { factory: '0x9c2abd632771b433e5e7507bcaa41ca3b25d8544', start: '2023-02-20', isAlgebraV3: true, },
  [CHAIN.OPTIMISM]: { factory: '0x0c8f7b0cb986b31c67d994fb5c224592a03a4afd', start: '2023-02-20', isAlgebraV3: true, },
}) */

const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    v2: v2Adapter.adapter,
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
