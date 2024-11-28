import { BreakdownAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getGraphDimensions2 } from "../helpers/getUniSubgraph";


const v3Graphs = getGraphDimensions2({
  graphUrls: {
    [CHAIN.ZETA]: 'https://subgraph.satsuma-prod.com/7d07f1edcbfd/codemelt/zeta-analytics/api'
  },
  totalVolume: {
    factory: "factories",
    field: "totalVolumeUSD",
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

const methodology = {
  UserFees: "User pays 0.3% fees on each swap.",
  Fees: "A 0.3% of each swap is collected as trading fees",
  Revenue: "Protocol have no revenue",
  ProtocolRevenue: "Protocol have no revenue.",
  SupplySideRevenue: "All user fees are distributed among LPs.",
  HoldersRevenue: "Holders have no revenue.",
};

const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    v3: {
      [CHAIN.ZETA]: {
        fetch: v3Graphs(CHAIN.ZETA),
        start: 1729171577,
        meta: {
          methodology,
        },
      }
    }
  },
};

export default adapter;
