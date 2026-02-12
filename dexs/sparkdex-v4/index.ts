import { CHAIN } from "../../helpers/chains";
import { Adapter } from "../../adapters/types";
import { graphDimensionFetch } from "../../helpers/getUniSubgraph";

const fetch = graphDimensionFetch({
  graphUrls: {
    [CHAIN.FLARE]: "https://api.goldsky.com/api/public/project_cm1tgcbwdqg8b01un9jf4a64o/subgraphs/sparkdex-v4/latest/gn",
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
    [CHAIN.FLARE]: {
      fetch,
      start: '2026-01-26',
    },
  },
};

export default adapters;
