import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getGraphDimensions2 } from "../../helpers/getUniSubgraph";

const dimensions = getGraphDimensions2({
  graphUrls: {
    [CHAIN.MANTLE]:
      "https://graph.butter.xyz/subgraphs/name/butterxyz/v3-subgraph",
  },
  totalVolume: {
    factory: "factories",
    field: "totalVolumeUSD",
  },
  totalFees: {
    factory: "factories",
    field: "totalFeesUSD",
  },
  feesPercent: {
    type: "fees",
    ProtocolRevenue: 0,
    HoldersRevenue: 0,
    Fees: 0,
    UserFees: 100,
    SupplySideRevenue: 100,
    Revenue: 0,
  },
});

export default {
  version: 2,
  adapter: {
    [CHAIN.MANTLE]: {
      fetch: dimensions(CHAIN.MANTLE),
      start: 1702339200,
    },
  },
} as SimpleAdapter;
