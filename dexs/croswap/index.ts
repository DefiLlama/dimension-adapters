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

adapters.adapter.cronos.start = '2022-09-28';
adapters.deadFrom = '2023-08-12';
export default adapters;
