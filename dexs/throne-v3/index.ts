import { Chain } from "@defillama/sdk/build/general";
import { BaseAdapter, BreakdownAdapter, IJSON } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

import { getGraphDimensions } from "../../helpers/getUniSubgraph";

const v3Endpoint = {
  [CHAIN.BASE]:
    "https://api.thegraph.com/subgraphs/name/somberload/throne-exchange-v3",
};

const VOLUME_USD = "volumeUSD";

const v3Graph = getGraphDimensions({
  graphUrls: v3Endpoint,
  totalVolume: {
    factory: "factories",
  },
  dailyVolume: {
    factory: "pancakeDayData",
    field: VOLUME_USD,
  },
  totalFees: {
    factory: "factories",
  },
  dailyFees: {
    factory: "pancakeDayData",
    field: "feesUSD",
  },
});

const v3StartTimes = {
  [CHAIN.BASE]: 2146977,
} as IJSON<number>;

const adapter: BreakdownAdapter = {
  breakdown: {
    v3: Object.keys(v3Endpoint).reduce((acc, chain) => {
      acc[chain] = {
        fetch: v3Graph(chain as Chain),
        start: async () => v3StartTimes[chain],
      };
      return acc;
    }, {} as BaseAdapter),
  },
};

export default adapter;
