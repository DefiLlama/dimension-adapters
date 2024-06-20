import * as sdk from "@defillama/sdk";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.AVAX]: sdk.graph.modifyEndpoint('7L3pXgL3sBVDkCjZjautaRjPr5u4dcUsG1KK6vj4XCec'),
};

const adapter = univ2Adapter(endpoints, {
  factoriesName: "zswapFactories",
  dayData: "zswapDayData",
  dailyVolume: "dailyVolumeUSD",
  totalVolume: "totalVolumeUSD"
});

adapter.adapter.avax.start = 1675814400;

export default adapter
