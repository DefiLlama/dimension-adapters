import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.MOONBEAN]: `https://gateway-arbitrum.network.thegraph.com/api/${process.env.GRAPH_PROTOCOL}/subgraphs/id/HgSAfZvHEDbAVuZciPUYEqFzhAUnjJWmyix5C1R2tmTp`
}, {});
adapters.adapter.moonbeam.start = 1641960253;
export default adapters;
