import * as sdk from "@defillama/sdk";
import { SimpleAdapter } from "../../adapters/types";
import { getChainVolume2 } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('8kFH5we1wSUT75VDWWyCB2Nqivawf6QaCE8L5k56nrfy'),
};

const graphs = getChainVolume2({
  graphUrls: endpoints,
  totalVolume: {
    factory: "factories",
    field: "totalVolumeUSD",
  },
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: graphs(CHAIN.ARBITRUM),
      start: 1685491200
    },
  },
};

export default adapter;
