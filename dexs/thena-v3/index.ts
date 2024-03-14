import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.BSC]: "https://api.thegraph.com/subgraphs/name/thenaursa/thena-fusion"
}, {
  factoriesName: "factories",
  dayData: "fusionDayData",
  dailyVolume: "volumeUSD",
  totalVolume: "totalVolumeUSD",
});

adapters.version = 2;
adapters.adapter.bsc.start = 1681516800;
export default adapters;
