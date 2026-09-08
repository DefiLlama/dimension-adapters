import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import {
  DEFAULT_TOTAL_VOLUME_FIELD,
  getGraphDimensions2,
} from "../helpers/getUniSubgraph";

const endpoints = {
  [CHAIN.QUAI]: "https://graph.quai.network/subgraphs/name/quainance/v2",
};

const graphs = getGraphDimensions2({
  graphUrls: endpoints,
  totalVolume: {
    factory: "uniswapFactories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  feesPercent: {
    type: "volume",
    Fees: 0.3,
    UserFees: 0.3,
    ProtocolRevenue: 0,
    HoldersRevenue: 0,
    Revenue: 0,
    SupplySideRevenue: 0.3, // 0.3% fee, all to LPs, nothing to protocol
  },
});

async function fetch(options: FetchOptions) {
  return graphs(options);
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  adapter: {
    [CHAIN.QUAI]: {
      start: '2026-07-06',
    },
  },
};

export default adapter;
