import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adpters = univ2Adapter({
  [CHAIN.BSC]: "https://api.thegraph.com/subgraphs/name/daomaker/bsc-amm"
}, {
  factoriesName: "pancakeFactories",
  dayData: "pancakeDayData",
});
adpters.adapter.bsc.start = 1663921255;
export default adpters;
