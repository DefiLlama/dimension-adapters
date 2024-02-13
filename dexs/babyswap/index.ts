import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.BSC]: "https://api.thegraph.com/subgraphs/name/babyswapgraph/exchange4"
}, {
    factoriesName: "pancakeFactories",
    dayData: "pancakeDayData",
});
adapters.adapter.bsc.start = 1622518288;
export default adapters;
