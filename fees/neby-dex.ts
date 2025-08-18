import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getGraphDimensions2 } from "../helpers/getUniSubgraph";

const methodology = {
  UserFees: "LPs collect 100% of the fee generated in a pool",
  Fees: "Fees generated on each swap at a rate set by the pool.",
};

const v3Graphs = getGraphDimensions2({
  graphUrls: {
    [CHAIN.SAPPHIRE]: "https://graph.api.neby.exchange/dex"
  },
  totalVolume: {
    factory: "factories",
  },
  feesPercent: {
    type: "fees",
    ProtocolRevenue: 0,
    HoldersRevenue: 0,
    Fees: 0,
    UserFees: 100, // User fees are 100% of collected fees
    SupplySideRevenue: 100, // 100% of fees are going to LPs
    Revenue: 0, // Revenue is 100% of collected fees
  },
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SAPPHIRE]: {
      fetch: v3Graphs,
    },
  },
  methodology,
};

export default adapter;
