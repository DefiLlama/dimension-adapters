import * as sdk from "@defillama/sdk";
import { SimpleAdapter } from "../adapters/types";
import { SONIC, CHAIN } from "../helpers/chains";
import {
  DEFAULT_DAILY_VOLUME_FACTORY,
  DEFAULT_TOTAL_VOLUME_FIELD,
  getGraphDimensions2,
} from "../helpers/getUniSubgraph";

type TStartTime = {
  [key: string]: number;
};
const startTimeV2: TStartTime = {
  [CHAIN.SONIC]: 1735129946,
};

const v2Endpoints = {
  [CHAIN.SONIC]:
    sdk.graph.modifyEndpoint('QmQUpw87hb34A97MJZJcFNDfG9sP3ekSMojNKxVfPH8Ukw'),
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
    HoldersRevenue: 100,
    UserFees: 100,
    Revenue: 100,
    SupplySideRevenue: 0,
    ProtocolRevenue: 0,
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
    [CHAIN.SONIC]: {
      fetch: v2Graphs(SONIC),
      start: startTimeV2[CHAIN.SONIC],
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
