import { CHAIN } from "../helpers/chains";
import { getGraphDimensions } from "../helpers/getUniSubgraph";
import { Adapter } from "../adapters/types";


const fetch = getGraphDimensions({
    graphUrls: {
      [CHAIN.FORMNETWORK]: "https://formapi.0xgraph.xyz/api/public/f96b70ac-d704-4e09-b300-ff0fb4992df2/subgraphs/analytics/v0.0.1/gn",
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
      [CHAIN.FORMNETWORK]: {
        fetch: fetch(CHAIN.FORMNETWORK),
        start: '2024-10-29',
      },
    },
  };
  
  export default adapters;