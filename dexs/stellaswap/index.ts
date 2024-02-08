import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.MOONBEAN]: "https://api.thegraph.com/subgraphs/name/stellaswap/stella-swap"
}, {});
adapters.adapter.moonbeam.start = 1641960253;
export default adapters;
