import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
    [CHAIN.BOBA]: "https://api.thegraph.com/subgraphs/name/gindev2/gin-subgraph"
}, {
});

adapters.adapter.boba.start = async () => 1653525524;
export default adapters;
