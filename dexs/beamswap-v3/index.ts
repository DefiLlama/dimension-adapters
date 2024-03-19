import { BreakdownAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import customBackfill from "../../helpers/customBackfill";
import {
  DEFAULT_DAILY_VOLUME_FACTORY,
  DEFAULT_TOTAL_VOLUME_FIELD,
  getGraphDimensions,
} from "../../helpers/getUniSubgraph";

const endpointV3 = {
  [CHAIN.MOONBEAM]:
    "https://api.thegraph.com/subgraphs/name/beamswap/beamswap-v3",
};
const VOLUME_USD = "volumeUSD";
const v3Graphs = getGraphDimensions({
  graphUrls: endpointV3,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: DEFAULT_DAILY_VOLUME_FACTORY,
    field: VOLUME_USD,
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
        start: 1684397388,
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
