import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

export default univ2Adapter({
  [CHAIN.DOGECHAIN]: "https://graph.yodeswap.dog/subgraphs/name/yodeswap"
}, {});
