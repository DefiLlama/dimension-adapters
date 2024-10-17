
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.TELOS]: "https://subgraph.meridianfinance.net/subgraphs/name/meridian-swaps",
}, {
});

adapters.adapter.telos.start = 1723909337;
export default adapters;
