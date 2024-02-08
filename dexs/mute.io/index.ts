import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.ERA]: "https://api.studio.thegraph.com/query/12332/muteswitch---zksync-era/v0.0.5",
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
