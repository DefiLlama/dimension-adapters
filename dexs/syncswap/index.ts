import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.ERA]: "https://api.studio.thegraph.com/query/30365/zksync-blocks/v0.0.9",
};

const adapter = univ2Adapter(endpoints, {
  factoriesName: "syncSwapFactories",
  dayData: "dayData",
  dailyVolume: "dailyVolumeUSD",
  totalVolume: "totalVolumeUSD",
  dailyVolumeTimestampField: "date",
});

adapter.adapter.era.start = 1679529600

export default adapter
