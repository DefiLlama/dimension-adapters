import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.XDAI]: "https://api.thegraph.com/subgraphs/name/levinswap/uniswap-v2"
}, {});

adapters.adapter.xdai.start = 1610767793;
export default adapters;
