import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

export default univ2Adapter({
  [CHAIN.FUNCTIONX]: "https://graph-node.functionx.io/subgraphs/name/subgraphFX2"
}, {
  factoriesName: "fxswapFactories",
  dayData: "fxswapDayData",
});
