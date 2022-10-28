import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

export default univ2Adapter({
  [CHAIN.POLYGON]: "https://api.thegraph.com/subgraphs/name/cometh-game/comethswap"
}, {
});
