import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.BITGERT]: "https://graph2.icecreamswap.com/subgraphs/name/simone1999/icecreamswap-bitgert",
  [CHAIN.CORE]: "https://graph-core.icecreamswap.com/subgraphs/name/simone1999/icecreamswap-core"
}, {
  factoriesName: "pancakeFactories",
  dayData: "pancakeDayData"
});
adapters.adapter.bitgert.start = async () => 1655917200;
adapters.adapter.core.start = async () => 1675814400;

export default adapters;
