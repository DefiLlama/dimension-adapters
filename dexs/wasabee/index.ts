import { CHAIN } from "../../helpers/chains";
import { graphDimensionFetch } from "../../helpers/getUniSubgraph";
import { Adapter } from "../../adapters/types";


const fetch = graphDimensionFetch({
    graphUrls: {
      [CHAIN.BERACHAIN]: "https://api.goldsky.com/api/public/project_cm78242tjtmme01uvcbkaay27/subgraphs/hpot-algebra-core/hpot-dex/gn",
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
      [CHAIN.BERACHAIN]: {
        fetch,
        start: '2024-10-29',
      },
    },
  };
  
  export default adapters;