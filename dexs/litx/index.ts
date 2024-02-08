import { DISABLED_ADAPTER_KEY } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import disabledAdapter from "../../helpers/disabledAdapter";
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

adapters.adapter.bsc.start = 1687305600;
adapters.adapter.pulse.start = 1686096000;
adapters.adapter[DISABLED_ADAPTER_KEY] = disabledAdapter;
export default adapters;
