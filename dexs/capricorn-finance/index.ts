import { DISABLED_ADAPTER_KEY } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import disabledAdapter from "../../helpers/disabledAdapter";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.CUBE]: "https://info.capricorn.finance/subgraphs/name/cube/dex-subgraph"
}, {
  factoriesName: "hswapFactories",
  dayData: "hswapDayData",
});

adapters.adapter[CHAIN.CUBE].start = 1630000000;
adapters.adapter[CHAIN.CUBE].fetch = async (timestamp: number) => {
  return {
    dailyVolume: 0,
    timestamp,
  }
}

adapters.adapter[DISABLED_ADAPTER_KEY] = disabledAdapter;
adapters.deadFrom = '1688947200';
export default adapters;
