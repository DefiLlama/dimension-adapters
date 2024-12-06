import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter2({
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('wN4QJb8MQXLwYwsEAVBAZpd112fYRkJPfetjS329ghh')
}, {
  factoriesName: "factories",
  dayData: "algebraDayData",
  dailyVolume: "volumeUSD",
  totalVolume: "totalVolumeUSD",
});

adapters.version = 2;
adapters.adapter.bsc.start = 1681516800;
export default adapters;
