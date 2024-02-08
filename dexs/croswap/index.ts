// https://arb1-graph.croswap.com/subgraphs/name/croswap/croswap-v2
// https://graph.croswap.com/subgraphs/name/croswap/croswap-v2

import { DISABLED_ADAPTER_KEY } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import disabledAdapter from "../../helpers/disabledAdapter";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.CRONOS]: "https://graph.croswap.com/subgraphs/name/croswap/croswap-v2",
  // [CHAIN.ARBITRUM]: "https://arb1-graph.croswap.com/subgraphs/name/croswap/croswap-v2"
}, {
  factoriesName: "uniswapFactories",
  dayData: "uniswapDayData"
});

adapters.adapter.cronos.start = 1664409600;
adapters.adapter[DISABLED_ADAPTER_KEY] = disabledAdapter;
export default adapters;
