import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.ARBITRUM]: "https://api.thegraph.com/subgraphs/name/jossduff/rubiconmetricsarbitrum",
  [CHAIN.OPTIMISM]: "https://api.thegraph.com/subgraphs/name/denverbaumgartner/rubiconmetricsoptimism"
}, {
  factoriesName: "rubicons",
  totalVolume: "total_volume_usd",
  dayData: "dayVolume",
  dailyVolume: "volume_usd",
  dailyVolumeTimestampField: "dayStartUnix"
});

adapters.adapter.arbitrum.start = 1686345120;
adapters.adapter.optimism.start = 1637020800;
export default adapters;