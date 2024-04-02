import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.ERA]: "https://api.goldsky.com/api/public/project_clmtie4nnezuh2nw6hhjg6mo7/subgraphs/mute_switch/v0.0.7/gn",
};

const adapter = univ2Adapter(endpoints, {
  factoriesName: "muteSwitchFactories",
  dayData: "muteSwitchDayData",
  dailyVolume: "dailyVolumeUSD",
  totalVolume: "totalVolumeUSD",
  dailyVolumeTimestampField: "date",
});

adapter.adapter.era.start = 1679529600

export default adapter