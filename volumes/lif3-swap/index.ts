import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

export default univ2Adapter({
  [CHAIN.TOMBCHAIN]: "https://graph-node.lif3.com/subgraphs/name/lifeswap"
}, {
});
