import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

export default univ2Adapter({
  [CHAIN.GODWOKEN]: "https://v0.yokaiswap.com/subgraphs/name/yokaiswap/exchange",
  [CHAIN.GODWOKEN_V1]: "https://www.yokaiswap.com/subgraphs/name/yokaiswap/exchange"
}, {
  factoriesName: "yokaiFactories",
  dayData: "yokaiDayData",
});
