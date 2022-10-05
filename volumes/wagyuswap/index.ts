import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.VELAS]: "https://thegraph3.wagyuswap.app/subgraphs/name/wagyu"
}, {
  factoriesName: "pancakeFactories",
  dayData: "pancakeDayData"
});
adapters.adapter.velas.start = async () => 1635653053;
export default adapters;
