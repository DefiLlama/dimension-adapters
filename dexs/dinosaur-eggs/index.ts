import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.BSC]: "https://api.thegraph.com/subgraphs/name/dinosaur-eggs/swap"
}, {
  factoriesName: "swapFactories",
  dayData: "swapDayData"
});
adapters.adapter.bsc.start = 1633046917;
export default adapters;
