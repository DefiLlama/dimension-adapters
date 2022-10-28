import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

export default univ2Adapter({
  [CHAIN.TOMOCHAIN]: "https://api.luaswap.org/subgraphs/name/phucngh/Luaswap3",
  // [CHAIN.ETHEREUM]: "https://api.luaswap.org/subgraphs/name/luasubgraph/Luaswap3" // invalid url
}, {});
