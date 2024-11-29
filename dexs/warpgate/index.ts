import { SimpleAdapter } from "../../adapters/types";
import { getChainVolume2 } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.IMX]: "https://subgraph.warpgate.pro/subgraphs/name/warpgate/subgraph-v3",
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
    [CHAIN.IMX]: {
      fetch: graphs(CHAIN.IMX),
      start: '2024-02-16'
    },
  },
};

export default adapter;
