import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.BSC]: "https://gateway-arbitrum.network.thegraph.com/api/[api-key]/subgraphs/id/Hnjf3ipVMCkQze3jmHp8tpSMgPmtPnXBR38iM4ix1cLt"
}, {
  factoriesName: "factories",
  dayData: "fusionDayData",
  dailyVolume: "volumeUSD",
  totalVolume: "totalVolumeUSD",
});

adapters.version = 2;
adapters.adapter.bsc.start = 1681516800;
export default adapters;
