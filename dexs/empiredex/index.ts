import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

export default univ2Adapter({
  [CHAIN.BSC]: "https://api.thegraph.com/subgraphs/name/trnhgquan/empiredexbsc",
  [CHAIN.XDAI]: "https://api.thegraph.com/subgraphs/name/zikyfranky/empire-xdai",
  [CHAIN.POLYGON]: "https://api.thegraph.com/subgraphs/name/zikyfranky/empire-polygon",
  [CHAIN.AVAX]: "https://api.thegraph.com/subgraphs/name/zikyfranky/empire-subgraph-avax",
}, {
});
