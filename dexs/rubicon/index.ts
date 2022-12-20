import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.OPTIMISM]: "https://api.thegraph.com/subgraphs/name/denverbaumgartner/rubiconmetricsoptimism"
}, {
  factoriesName: "rubicons",
  totalVolume: "total_volume_usd",
  dayData: "dayVolume",
  dailyVolume: "volume_usd",
  dailyVolumeTimestampField: "dayStartUnix"
});

adapters.adapter.optimism.start = async () => 1637020800;
export default adapters;
