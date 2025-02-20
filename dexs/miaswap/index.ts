import { DISABLED_ADAPTER_KEY, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import disabledAdapter from "../../helpers/disabledAdapter";
import { DEFAULT_TOTAL_VOLUME_FIELD, getGraphDimensions2 } from "../../helpers/getUniSubgraph";

const v3Endpoints = {
  [CHAIN.ONUS]: "https://subgraph.onuschain.io/subgraphs/name/onus/miaswap-v3-subgraph"
}

const v3Graphs = getGraphDimensions2({
  graphUrls: v3Endpoints,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  feesPercent: {
    type: "fees",
    ProtocolRevenue: 0,
    HoldersRevenue: 0,
    Fees: 0,
    UserFees: 100, // User fees are 100% of collected fees
    SupplySideRevenue: 0, // 100% of fees are going to LPs
    Revenue: 0 // Revenue is 100% of collected fees
  }
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [DISABLED_ADAPTER_KEY]: disabledAdapter,
    [CHAIN.ONUS]: {
      fetch: async (timestamp: number) => { return { timestamp } },
      start: '2023-06-01',
    },
  },
};

export default adapter;
