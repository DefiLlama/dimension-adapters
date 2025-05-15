import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter2({
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('BoHp9H2rGzVFPiqc56PJ1Gw7EPDaiHMcupsUuksMGp2K')
}, {
  factoriesName: "factories",
  dayData: "fusionDayData",
  dailyVolume: "volumeUSD",
  totalVolume: "totalVolumeUSD",
});

adapters.adapter.bsc.start = '2024-11-18';
export default adapters;
