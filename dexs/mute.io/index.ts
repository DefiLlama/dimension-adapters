import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";

const endpoints = {
  [CHAIN.ERA]: "https://api.goldsky.com/api/public/project_clmtie4nnezuh2nw6hhjg6mo7/subgraphs/mute_switch/v0.0.7/gn",
};

const fetch = univ2Adapter({
  endpoints,
  factoriesName: "muteSwitchFactories",
  dayData: "muteSwitchDayData",
  dailyVolume: "dailyVolumeUSD",
  totalVolume: "totalVolumeUSD",
  dailyVolumeTimestampField: "date",
});

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.ERA],
  start: 1679529600,
}

export default adapter;