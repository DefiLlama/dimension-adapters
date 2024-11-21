import { CHAIN } from "../../helpers/chains";
import { Adapter } from "../../adapters/types";
import { getGraphDimensions } from "../../helpers/getUniSubgraph";

const fetch = getGraphDimensions({
  graphUrls: {
    [CHAIN.MORPH]: "https://subgraph.morfi.io/subgraphs/name/morfi/core",
  },
  totalVolume: {
    factory: "factories",
    field: "totalVolumeUSD",
  },
  dailyVolume: {
    factory: "algebraDayData",
    field: "volumeUSD",
  },
  totalFees: {
    factory: "factories",
    field: "totalFeesUSD",
  },
  dailyFees: {
    factory: "algebraDayData",
    field: "feesUSD",
  },
});

const adapters: Adapter = {
  adapter: {
    [CHAIN.MORPH]: {
      fetch: fetch(CHAIN.MORPH),
      start: '2024-10-29',
    },
  },
};

export default adapters;
