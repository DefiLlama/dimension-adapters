import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getFeesExport } from "../helpers/balancer";

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.BASE]: {fetch: getFeesExport('0x7122e35ceC2eED4A989D9b0A71998534A203972C'), },
    [CHAIN.NEON]: {fetch: getFeesExport('0x7122e35ceC2eED4A989D9b0A71998534A203972C'), },
  },
  version: 2,
};
export default adapters;

// const endpoints: ChainEndpoints = {
//   [CHAIN.NEON]: "https://neon-subgraph.sobal.fi/sobal-pools",
//   [CHAIN.BASE]: "https://api.studio.thegraph.com/query/50526/sobal-base/version/latest",
// };

// const graphParams = {
//   totalVolume: {
//     factory: "balancers",
//     field: "totalSwapVolume",
//   },
// }

// const graphs = getChainVolume2({
//   graphUrls: endpoints,
//   ...graphParams
// });

// const adapter: SimpleAdapter = {
//   version: 2,
//   adapter: {
//     [CHAIN.NEON]: {
//       fetch: graphs(CHAIN.NEON),
//       start: '2023-07-17', // 17TH JULY 5PM GMT
//       customBackfill: customBackfill(CHAIN.NEON as Chain, graphs),
//     },
//     [CHAIN.BASE]: {
//       fetch: graphs(CHAIN.BASE),
//       start: '2023-08-01', // 1ST AUG 12:33 AM GMT
//       customBackfill: customBackfill(CHAIN.BASE as Chain, graphs),
//     }
//   }
// }

// export default adapter;
