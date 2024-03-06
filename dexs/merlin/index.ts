import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
    [CHAIN.ERA]: "https://api.studio.thegraph.com/query/45654/merlin-subgraph/v0.1.0"
}, {});

adapters.adapter.era.start = 1680274800;
export default adapters;
