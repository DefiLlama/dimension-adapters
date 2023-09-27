import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.ETHEREUM]: "https://api.thegraph.com/subgraphs/name/solidlylabs/solidly-v3"
}, {
  factoriesName: "factories",
  dayData: "solidlyDayData",
  dailyVolume: "volumeUSD",
  totalVolume: "totalVolumeUSD",
});

adapters.adapter.ethereum.start = async () => 18044650;
export default adapters;