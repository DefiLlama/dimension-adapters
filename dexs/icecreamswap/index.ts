import { DISABLED_ADAPTER_KEY } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import disabledAdapter from "../../helpers/disabledAdapter";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.BITGERT]: "https://graph2.icecreamswap.com/subgraphs/name/simone1999/icecreamswap-bitgert",
  [CHAIN.CORE]: "https://graph-core.icecreamswap.com/subgraphs/name/simone1999/icecreamswap-core"
}, {
  factoriesName: "pancakeFactories",
  dayData: "pancakeDayData"
});
adapters.adapter.bitgert.start = 1655917200;
adapters.adapter.core.start = 1675814400;
adapters.adapter[DISABLED_ADAPTER_KEY] = disabledAdapter;
export default adapters;
