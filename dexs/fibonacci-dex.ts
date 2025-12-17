// import { CHAIN } from "../helpers/chains";
// import { graphDimensionFetch } from "../helpers/getUniSubgraph";
// import { Adapter } from "../adapters/types";


// const fetch = graphDimensionFetch({
//     graphUrls: {
//       [CHAIN.FORMNETWORK]: "https://formapi.0xgraph.xyz/api/public/f96b70ac-d704-4e09-b300-ff0fb4992df2/subgraphs/analytics/v0.0.1/gn",
//     },
//     dailyVolume: {
//       factory: "algebraDayData",
//       field: "volumeUSD",
//     },
//     dailyFees: {
//       factory: "algebraDayData",
//       field: "feesUSD",
//     },
//   });
  
//   const adapters: Adapter = {
//     adapter: {
//       [CHAIN.FORMNETWORK]: {
//         fetch,
//         start: '2024-10-29',
//       },
//     },
//   };
  
//   export default adapters;

import { CHAIN } from "../helpers/chains";
import { Adapter } from "../adapters/types";

const adapters: Adapter = {
  deadFrom: "2025-08-15", // Form Network has been sunsetted and Fibonacci Dex no longer exists
  adapter: {
    [CHAIN.FORMNETWORK]: {
      fetch: async () => ({
        dailyVolume: 0,
        dailyFees: 0,
      }),
      start: "2024-10-29",
    },
  },
};

export default adapters;
