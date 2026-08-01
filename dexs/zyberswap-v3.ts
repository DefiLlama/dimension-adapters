import * as sdk from "@defillama/sdk";
import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getChainVolume2 } from "../helpers/getUniSubgraphVolume";

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

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: graphsV3(CHAIN.ARBITRUM),
      start: '2023-02-20',
    },
  },
};

export default adapter;
