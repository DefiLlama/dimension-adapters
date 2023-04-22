import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
    [CHAIN.ZKSYNC]: "https://api.studio.thegraph.com/query/45654/merlin-subgraph/v0.1.0"
}, {});

adapters.adapter.zksync.start = async () => 887190;
export default adapters;
