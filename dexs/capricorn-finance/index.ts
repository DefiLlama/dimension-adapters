import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

export default univ2Adapter({
  [CHAIN.CUBE]: "https://info.capricorn.finance/subgraphs/name/cube/dex-subgraph"
}, {
  factoriesName: "hswapFactories",
  dayData: "hswapDayData",
});
