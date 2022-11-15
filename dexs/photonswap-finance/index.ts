
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

export default univ2Adapter({
  [CHAIN.CRONOS]: "https://gnode.photonswap.finance/subgraphs/name/dexbruce/photonswap"
}, {});
