
// https://api.studio.thegraph.com/query/55584/v3_scroll/version/latest
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.SCROLL]: "https://api.studio.thegraph.com/query/55584/v3_scroll/version/latest",
};

const adapter = univ2Adapter(endpoints, {
  factoriesName: "factories",
  dayData: "uniswapDayData",
  dailyVolume: "volumeUSD",
  totalVolume: "totalVolumeUSD",
  dailyVolumeTimestampField: "date",
});

adapter.adapter.scroll.start = 1700697600
export default adapter
