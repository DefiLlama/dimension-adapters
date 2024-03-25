import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getStartTimestamp } from "../../helpers/getStartTimestamp";

import {
  getGraphDimensions,
  DEFAULT_DAILY_VOLUME_FACTORY,
  DEFAULT_TOTAL_VOLUME_FIELD,
} from "../../helpers/getUniSubgraph"

const v3Endpoints = {
  [CHAIN.METIS]: "https://metis-graph.maiadao.io/uniswap-v3",
};

const VOLUME_USD = "volumeUSD";

const v3Graphs = getGraphDimensions({
  graphUrls: v3Endpoints,
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
    ProtocolRevenue: 10, // 10% of fees are going to protocol
    HoldersRevenue: 0,
    UserFees: 100, // User fees are 100% of collected fees
    SupplySideRevenue: 90, // 90% of fees are going to LPs
    Revenue: 0 // Revenue is 100% of collected fees
  }
});

const methodology = {
  UserFees: "User pays 0.01%, 0.05%, 0.30%, or 1% on each swap.",
  ProtocolRevenue: "Protocol receives 10% of fees.",
  SupplySideRevenue: "90% of user fees are distributed among LPs.",
  HoldersRevenue: "Holders have no revenue."
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.METIS]: {
      fetch: v3Graphs(CHAIN.METIS),
      start: 1680307200,
      meta: {
        methodology: {
          ...methodology,
        }
      }
    }
  }
}

export default adapter;
