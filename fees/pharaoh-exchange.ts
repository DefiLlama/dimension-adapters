import * as sdk from "@defillama/sdk";
import { SimpleAdapter } from "../adapters/types";
import { AVAX, CHAIN } from "../helpers/chains";
import {
  DEFAULT_DAILY_VOLUME_FACTORY,
  DEFAULT_TOTAL_VOLUME_FIELD,
  getGraphDimensions2,
} from "../helpers/getUniSubgraph";

type TStartTime = {
  [key: string]: number;
};
const startTimeV2: TStartTime = {
  [CHAIN.AVAX]: 1702339200,
};

const v2Endpoints = {
  [CHAIN.AVAX]:
    sdk.graph.modifyEndpoint('oM4WnuyAbSwPpjk6niUkp88AZg1hSTi9aC1ZM4RcsqR'),
};

const VOLUME_USD = "volumeUSD";

const v2Graphs = getGraphDimensions2({
  graphUrls: v2Endpoints,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  feesPercent: {
    type: "fees",
    HoldersRevenue: 72,
    UserFees: 100, // User fees are 100% of collected fees
    Revenue: 80, // Revenue is 50% of collected fees
    SupplySideRevenue: 20,
    ProtocolRevenue: 8,
  },
});

const methodology = {
  UserFees: "User pays 0.3% fees on each swap.",
  ProtocolRevenue: "Revenue going to the protocol.",
  HoldersRevenue: "User fees are distributed among holders.",
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.AVAX]: {
      fetch: v2Graphs(AVAX),
      start: startTimeV2[CHAIN.AVAX],
      meta: {
        methodology: {
          ...methodology,
          UserFees: "User pays 0.05%, 0.30%, or 1% on each swap.",
        },
      },
    },
  },
};

export default adapter;
