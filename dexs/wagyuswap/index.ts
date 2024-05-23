import { DISABLED_ADAPTER_KEY } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import disabledAdapter from "../../helpers/disabledAdapter";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.VELAS]: "https://thegraph3.wagyuswap.app/subgraphs/name/wagyu"
}, {
  factoriesName: "pancakeFactories",
  dayData: "pancakeDayData"
});
adapters.adapter.velas.start = 1635653053;
adapters.adapter[DISABLED_ADAPTER_KEY] = disabledAdapter;
export default adapters;
