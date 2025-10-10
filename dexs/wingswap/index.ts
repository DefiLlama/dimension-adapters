import { getUniV2LogAdapter } from "../../helpers/uniswap";
import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";

// const endpoints = {
//   [CHAIN.FANTOM]: sdk.graph.modifyEndpoint('FQXGq9b1cWfrZVU4VVZyyRAgaLRQjUULE6YS26rkB1WM'),
// };

// const fetch = univ2Adapter({
//   endpoints,
//   factoriesName: "wingSwapFactories",
//   dayData: "wingSwapDayData",
//   gasToken: "coingecko:fantom"
// });

const adapter: SimpleAdapter = {
  version: 2,
  fetch: getUniV2LogAdapter({ factory: '0xc0719a9A35a2D9eBBFdf1C6d383a5E8E7b2ef7a8', userFeesRatio: 1, revenueRatio: 0 }),
  chains: [CHAIN.FANTOM],
  start: 1637452800,
}

export default adapter;
