import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

export default univ2Adapter({
  [CHAIN.FANTOM]: "https://api.thegraph.com/subgraphs/name/wigoswap/exchange2"
}, {
  factoriesName: "wigoswapFactories",
  dayData: "wigoDayData",
});
