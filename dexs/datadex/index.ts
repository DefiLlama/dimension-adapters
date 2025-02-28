// vana

import { SimpleAdapter } from "../../adapters/types";
import { DEFAULT_TOTAL_VOLUME_FIELD, getChainVolume2 } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.VANA]: "https://api.goldsky.com/api/public/project_clnbo3e3c16lj33xva5r2aqk7/subgraphs/data-dex-vana/prod/gn",
};

const graphs = getChainVolume2({
  graphUrls: endpoints,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.VANA]: {
      fetch: graphs(CHAIN.VANA),
      start: '2024-12-03',
    },
  },
};

export default adapter;
