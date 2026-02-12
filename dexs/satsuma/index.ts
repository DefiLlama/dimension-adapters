import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV3LogAdapter } from "../../helpers/uniswap";

// const endpoints = {
//   [CHAIN.CITREA]: "https://api.goldsky.com/api/public/project_cmamb6kkls0v2010932jjhxj4/subgraphs/analytics-mainnet/v1.0.3/gn"
// };

// const graphs = getChainVolume({
//   graphUrls: endpoints,
//   totalVolume: {
//     factory: "factories",
//     field: "totalVolumeUSD",
//   },
//   dailyVolume: {
//     factory: "algebraDayData",
//     field: "volumeUSD",
//     dateField: "date"
//   },
//   hasDailyVolume: true,
// });

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.CITREA]: {
      fetch: getUniV3LogAdapter({ factory: '0x10253594A832f967994b44f33411940533302ACb', isAlgebraV3: true }),
      start: "2026-01-17",
    },
  },
};

export default adapter;
