
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.SCROLL]: "https://api.studio.thegraph.com/query/55584/v3_scroll/version/latest",
};

const adapter = univ2Adapter2(endpoints, {
  factoriesName: "factories",
  totalVolume: "totalVolumeUSD",
});

adapter.adapter.scroll.start = 1700697600
export default adapter
