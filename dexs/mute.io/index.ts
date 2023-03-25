import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.ERA]: "https://graph.mute.io/subgraphs/name/mattt21/muteswitch_mainnet",
};

const adapter = univ2Adapter(endpoints, {
  factoriesName: "muteSwitchFactories",
  dayData: "muteSwitchDayData",
  dailyVolume: "dailyVolumeUSD",
  totalVolume: "totalVolumeUSD",
  dailyVolumeTimestampField: "date"
});

adapter.adapter.era.start = async () => 1679529600

export default adapter
