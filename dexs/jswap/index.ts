import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

export default univ2Adapter({
  [CHAIN.OKEXCHAIN]: "https://graph.jfswap.com/subgraphs/name/jfswap/jfswap-subgraph"
}, {
    factoriesName: "jswapFactories",
    dayData: "jswapDayData",
});
