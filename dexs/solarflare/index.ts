
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapter = univ2Adapter({
  [CHAIN.MOONBEAM]: "https://api.thegraph.com/subgraphs/name/solarbeamio/solarflare-subgraph"
},{});
adapter.adapter.moonbeam.start = async () => 1642032000;
export default adapter;
