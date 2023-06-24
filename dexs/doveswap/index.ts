import { Chain } from "@defillama/sdk/build/general";
import { BreakdownAdapter, FetchResultGeneric, BaseAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getStartTimestamp } from "../../helpers/getStartTimestamp";

import {
  getGraphDimensions,
  DEFAULT_DAILY_VOLUME_FACTORY,
  DEFAULT_TOTAL_VOLUME_FIELD,
} from "../../helpers/getUniSubgraph"
import { type } from "os";


const v3Endpoints = {
  [CHAIN.POLYGON_ZKEVM]:
    "https://api.studio.thegraph.com/query/47443/v3-test/v0.0.5/graphql",

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
    ProtocolRevenue: 0,
    HoldersRevenue: 0,
    UserFees: 100, // User fees are 100% of collected fees
    SupplySideRevenue: 100, // 100% of fees are going to LPs
    Revenue: 0 // Revenue is 100% of collected fees
  }
});

const methodology = {
  UserFees: "User pays 0.3% fees on each swap.",
  ProtocolRevenue: "Protocol have no revenue.",
  SupplySideRevenue: "All user fees are distributed among LPs.",
  HoldersRevenue: "Holders have no revenue."
}

type TStartTime = {
  [key: string]: number;
}
const startTimeV3:TStartTime = {
  [CHAIN.POLYGON_ZKEVM]:  1679875200,

}
const adapter: BreakdownAdapter = {
  breakdown: {
    v3: Object.keys(v3Endpoints).reduce((acc, chain) => {
      acc[chain] = {
        fetch: v3Graphs(chain as Chain),
        start: async () => startTimeV3[chain],
        meta: {
          methodology: {
            ...methodology,
            UserFees: "User pays 0.05%, 0.30%, or 1% on each swap."
          }
        }
      }
      return acc
    }, {} as BaseAdapter)
  }
}

export default adapter;
