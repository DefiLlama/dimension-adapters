import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.BSC]: "https://api.thegraph.com/subgraphs/name/iliaazhel/litx-v1-1",
  [CHAIN.PULSECHAIN]: "https://api.algebra.finance/pulse-graph/subgraphs/name/cryptoalgebra/litx-analytics"
}, {
  factoriesName: "factories",
  dayData: "algebraDayData",
  dailyVolume: "volumeUSD",
  totalVolume: "totalVolumeUSD",
});

adapters.adapter.bsc.start = async () => 1687305600;
adapters.adapter.pulse.start = async () => 1686096000;
export default adapters;
