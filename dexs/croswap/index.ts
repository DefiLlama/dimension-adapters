// https://arb1-graph.croswap.com/subgraphs/name/croswap/croswap-v2
// https://graph.croswap.com/subgraphs/name/croswap/croswap-v2

import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.CRONOS]: "https://graph.croswap.com/subgraphs/name/croswap/croswap-v2",
  // [CHAIN.ARBITRUM]: "https://arb1-graph.croswap.com/subgraphs/name/croswap/croswap-v2"
}, {
  factoriesName: "uniswapFactories",
  dayData: "uniswapDayData"
});

adapters.adapter.cronos.start = async () => 1664409600;
export default adapters;
