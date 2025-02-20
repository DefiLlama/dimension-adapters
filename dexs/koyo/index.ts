import * as sdk from "@defillama/sdk";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import customBackfill from "../../helpers/customBackfill";
import { getChainVolume2 } from "../../helpers/getUniSubgraphVolume";

const endpoints = {
  [CHAIN.BOBA]:
    sdk.graph.modifyEndpoint('3CdxAdbTrVDhM6WQCr5TN4y4zxAodMAmcZwFFWRnEKz3'),
};

const graphs = getChainVolume2({
  graphUrls: endpoints,
  totalVolume: {
    factory: "koyos",
    field: "totalSwapVolume",
  },
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BOBA]: {
      fetch: graphs(CHAIN.BOBA),
      start: '2022-06-13',
      customBackfill: customBackfill(CHAIN.BOBA, graphs),
    },
  },
};

export default adapter;
