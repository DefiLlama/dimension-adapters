import { Chain } from "@defillama/sdk/build/general";
import { BreakdownAdapter, BaseAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

import {
  getGraphDimensions,
  DEFAULT_DAILY_VOLUME_FACTORY,
  DEFAULT_TOTAL_VOLUME_FIELD,
} from "../../helpers/getUniSubgraph";

const v3Endpoints = {
  [CHAIN.MANTA]: "https://subgraph.fireflydex.io/subgraphs/name/firefly/v3",
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
    UserFees: 100, // User fees are 100% of collected fees
    SupplySideRevenue: 100, // 100% of fees are going to LPs
  },
});

const methodology = {
  UserFees: "Users pay 0.05%, 0.3%, 1% depending on the fee rate for the swap.",
  ProtocolRevenue: "Protocol have no revenue.",
  SupplySideRevenue: "All user fees are distributed among LPs.",
  HoldersRevenue: "Holders have no revenue.",
};

type TStartTime = {
  [key: string]: number;
};
const startTimeV3: TStartTime = {
  [CHAIN.MANTA]: 1711991119,
};

const adapter: BreakdownAdapter = {
  breakdown: {
    v3: Object.keys(v3Endpoints).reduce((acc, chain) => {
      acc[chain] = {
        fetch: v3Graphs(chain as Chain),
        start: startTimeV3[chain],
        meta: {
          methodology: {
            ...methodology,
          },
        },
      };
      return acc;
    }, {} as BaseAdapter),
  },
};

export default adapter;
