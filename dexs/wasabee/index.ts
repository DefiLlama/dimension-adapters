import { CHAIN } from "../../helpers/chains";
import { getGraphDimensions } from "../../helpers/getUniSubgraph";
import { Adapter } from "../../adapters/types";


const fetch = getGraphDimensions({
    graphUrls: {
      [CHAIN.BERACHAIN]: "https://api.goldsky.com/api/public/project_cm78242tjtmme01uvcbkaay27/subgraphs/hpot-algebra-core/hpot-dex/gn",
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
      [CHAIN.BERACHAIN]: {
        fetch: fetch(CHAIN.BERACHAIN),
        start: '2024-10-29',
      },
    },
  };
  
  export default adapters;