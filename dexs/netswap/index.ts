import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.METIS]: "https://andromeda.thegraph.metis.io/subgraphs/name/netswap/exchange"
}, {
  factoriesName: "netswapFactories",
  dayData: "netswapDayData"
});
adapters.adapter.metis.start = 1638760703;
export default adapters;
