import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
    [CHAIN.MILKOMEDA]: "https://milkomeda.muesliswap.com/graph/subgraphs/name/muesliswap/exchange"
}, {
  factoriesName: "pancakeFactories",
  dayData: "pancakeDayData",
});

adapters.adapter.milkomeda.start = async () => 1648427924;
export default adapters;
