// https://api.thegraph.com/subgraphs/name/camelotlabs/camelot-amm-2
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
    [CHAIN.ARBITRUM]: "https://api.thegraph.com/subgraphs/name/camelotlabs/camelot-amm-2"
}, {});

adapters.adapter.arbitrum.start = 1668124800;
export default adapters;
