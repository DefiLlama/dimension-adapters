import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

export default univ2Adapter({
  [CHAIN.POLYGON]: "https://api.thegraph.com/subgraphs/name/polymmfinance/exchang"
}, {
  factoriesName: "pancakeFactories",
  dayData: "pancakeDayData"
});
