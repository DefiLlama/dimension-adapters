import { getUniV2LogAdapter } from "../../helpers/uniswap";
import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";

// const endpoints = {
//   [CHAIN.ERA]: "https://api.goldsky.com/api/public/project_clmtie4nnezuh2nw6hhjg6mo7/subgraphs/mute_switch/v0.0.7/gn",
// };

// const fetch = univ2Adapter({
//   endpoints,
//   factoriesName: "muteSwitchFactories",
//   dayData: "muteSwitchDayData",
//   dailyVolume: "dailyVolumeUSD",
//   totalVolume: "totalVolumeUSD",
//   dailyVolumeTimestampField: "date",
// });

const adapter: SimpleAdapter = {
  version: 2,
  fetch: getUniV2LogAdapter({ factory: '0x40be1cba6c5b47cdf9da7f963b6f761f4c60627d', userFeesRatio: 1, revenueRatio: 0.2, protocolRevenueRatio: 0.2 }),
  chains: [CHAIN.ERA],
  start: 1679529600,
}

export default adapter;