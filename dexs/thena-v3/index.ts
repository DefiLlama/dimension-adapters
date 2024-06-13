import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('Hnjf3ipVMCkQze3jmHp8tpSMgPmtPnXBR38iM4ix1cLt')
}, {
  factoriesName: "factories",
  dayData: "fusionDayData",
  dailyVolume: "volumeUSD",
  totalVolume: "totalVolumeUSD",
});

adapters.version = 2;
adapters.adapter.bsc.start = 1681516800;
export default adapters;
