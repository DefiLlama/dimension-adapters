// https://api.thegraph.com/subgraphs/name/camelotlabs/camelot-amm-2
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
    [CHAIN.ARBITRUM]: "https://api.thegraph.com/subgraphs/name/camelotlabs/camelot-amm"
}, {});

adapters.adapter.arbitrum.start = async () => 1667952000;
export default adapters;
