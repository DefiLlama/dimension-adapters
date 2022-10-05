import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

export default univ2Adapter({
  [CHAIN.METIS]: "https://graph-node.tethys.finance/subgraphs/name/tethys2"
}, {
});
