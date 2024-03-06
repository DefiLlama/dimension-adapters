import { Chain } from "@defillama/sdk/build/general";
import { CHAIN } from "../../helpers/chains";
import { getGraphDimensions } from "../../helpers/getUniSubgraph";

const endpointsV2 = {
  [CHAIN.AVAX]:
    "https://api.thegraph.com/subgraphs/name/thehitesh172/vapordex-v2-avalanche-test",
};

const v2Graphs = getGraphDimensions({
  graphUrls: endpointsV2,
  totalVolume: {
    factory: "factories",
    field: "totalVolumeUSD",
  },
  dailyVolume: {
    factory: "vaporDEXDayData",
    field: "volumeUSD",
  },
  dailyFees: {
    factory: "vaporDEXDayData",
    field: "feesUSD",
  },
  feesPercent: {
    type: "fees",
    ProtocolRevenue: 0,
    HoldersRevenue: 0,
    UserFees: 100, // User fees are 100% of collected fees
    SupplySideRevenue: 100, // 100% of fees are going to LPs
    Revenue: 0, // Set revenue to 0 as protocol fee is not set for all pools for now
  },
});

const startTimeV2: { [key: string]: number } = {
  [CHAIN.AVAX]: 1697500800,
};

const v2 = Object.keys(endpointsV2).reduce(
  (acc, chain) => ({
    ...acc,
    [chain]: {
      fetch: v2Graphs(chain as Chain),
      start: startTimeV2[chain],
    },
  }),
  { }
);

export default v2;
