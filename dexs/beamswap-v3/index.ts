import { BreakdownAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import customBackfill from "../../helpers/customBackfill";
import {
  DEFAULT_TOTAL_VOLUME_FIELD,
  getGraphDimensions2,
} from "../../helpers/getUniSubgraph";

const endpointV3 = {
  [CHAIN.MOONBEAM]:
    "https://graph.beamswap.io/subgraphs/name/beamswap/beamswap-amm-v3",
};

const v3Graphs = getGraphDimensions2({
  graphUrls: endpointV3,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  feesPercent: {
    type: "fees",
    ProtocolRevenue: 16,
    HoldersRevenue: 0,
    UserFees: 100, // User fees are 100% of collected fees
    SupplySideRevenue: 84, // 84% of fees are going to LPs
    Revenue: 0,
  },
});

const methodologyv3 = {
  UserFees: "User pays 0.01%, 0.05%, 0.3%, or 1% on each swap.",
  ProtocolRevenue: "Protocol receives 16% of fees.",
  SupplySideRevenue: "84% of user fees are distributed among LPs.",
  HoldersRevenue: "Holders have no revenue.",
};

const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    v3: {
      [CHAIN.MOONBEAN]: {
        fetch: v3Graphs(CHAIN.MOONBEAN),
        start: '2023-05-18',
        customBackfill: customBackfill(CHAIN.MOONBEAN, v3Graphs),
        meta: {
          methodology: {
            ...methodologyv3,
          },
        },
      },
    },
  },
};

export default adapter;
