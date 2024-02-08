// https://api.thegraph.com/subgraphs/name/stellaswap/pulsar
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.MOONBEAN]: "https://api.thegraph.com/subgraphs/name/stellaswap/pulsar"
}, {
  factoriesName: "factories",
  dayData: "algebraDayData",
  dailyVolume: "volumeUSD",
  totalVolume: "totalVolumeUSD",
});
adapters.adapter.moonbeam.start = 1672876800;
export default adapters;
