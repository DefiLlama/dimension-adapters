import { Chain } from "@defillama/sdk/build/general";
import { BreakdownAdapter, BaseAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import {
  DEFAULT_TOTAL_VOLUME_FIELD,
  getGraphDimensions2,
} from "../../helpers/getUniSubgraph";

const v3Endpoints = {
  [CHAIN.POLYGON_ZKEVM]:
    "https://api.studio.thegraph.com/query/47443/v3-test/v0.0.5",
};

const v3Graphs = getGraphDimensions2({
  graphUrls: v3Endpoints,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  feesPercent: {
    type: "fees",
    ProtocolRevenue: 25,
    HoldersRevenue: 0, // Holders get no revenue directly for now because buy and burn mechanism is in place
    UserFees: 100, // User fees are 100% of collected fees
    SupplySideRevenue: 75, // 75% of fees are going to LPs
    Revenue: 100, // Revenue is 100% of collected fees
  },
});

const methodology = {
  UserFees: "User pays 0.01%, 0.05%, 0.30%, or 1% on each swap.",
  ProtocolRevenue: "Protocol has revenue.",
  SupplySideRevenue: "75% of user fees are distributed among LPs.",
  HoldersRevenue: "Holders have no revenue.",
};

type TStartTime = {
  [key: string]: number;
};
const startTimeV3: TStartTime = {
  [CHAIN.POLYGON_ZKEVM]: 1679875200,
};
const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    v3: Object.keys(v3Endpoints).reduce((acc, chain) => {
      acc[chain] = {
        fetch: v3Graphs(chain as Chain),
        start: startTimeV3[chain],
        meta: {
          methodology: {
            ...methodology,
            UserFees: "User pays 0.01%, 0.05%, 0.30%, or 1% on each swap.",
          },
        },
      };
      return acc;
    }, {} as BaseAdapter),
  },
};

export default adapter;
