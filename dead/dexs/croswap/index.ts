// https://arb1-graph.croswap.com/subgraphs/name/croswap/croswap-v2
// https://graph.croswap.com/subgraphs/name/croswap/croswap-v2

import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const endpoints = {
  [CHAIN.CRONOS]: "https://graph.croswap.com/subgraphs/name/croswap/croswap-v2",
  // [CHAIN.ARBITRUM]: "https://arb1-graph.croswap.com/subgraphs/name/croswap/croswap-v2"
};

const fetch = univ2Adapter({
  endpoints,
  factoriesName: "uniswapFactories",
  dayData: "uniswapDayData"
});

const adapter: SimpleAdapter = {
  version: 1,
  deadFrom: '2023-08-12',
  fetch,
  chains: Object.keys(endpoints),
  start: '2022-09-28',
}

export default adapter;
