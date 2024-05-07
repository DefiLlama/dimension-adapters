// https://metisapi.0xgraph.xyz/subgraphs/name/amm-subgraph-andromeda/
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
    [CHAIN.METIS]: "https://metisapi.0xgraph.xyz/subgraphs/name/amm-subgraph-andromeda/"
}, {});

adapters.adapter.metis.start = 1710115200;
export default adapters;
