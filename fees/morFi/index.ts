import { CHAIN } from "../../helpers/chains";
import { Adapter } from "../../adapters/types";
import { graphDimensionFetch } from "../../helpers/getUniSubgraph";

const fetch = graphDimensionFetch({
  graphUrls: {
    [CHAIN.MORPH]: "https://subgraph.morfi.io/subgraphs/name/morfi/core",
  },
  dailyVolume: {
    factory: "algebraDayData",
    field: "volumeUSD",
  },
  dailyFees: {
    factory: "algebraDayData",
    field: "feesUSD",
  },
});

const adapters: Adapter = {
  adapter: {
    [CHAIN.MORPH]: {
      fetch,
      start: '2024-10-29',
    },
  },
};

export default adapters;
