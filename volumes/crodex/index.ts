import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

export default univ2Adapter({
  [CHAIN.CRONOS]: "https://infoapi.crodex.app/subgraphs/name/crograph2/crodex2"
}, {
  factoriesName: "uniswapFactories",
  dayData: "uniswapDayData"
});
