import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

export default univ2Adapter({
    [CHAIN.OPTIMISM]: "https://api.thegraph.com/subgraphs/name/nonamefits/zipswap"
}, {});
