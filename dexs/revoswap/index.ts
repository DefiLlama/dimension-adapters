import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

// const endpoints = {
//   [CHAIN.XLAYER]: "https://graph.revoswap.com/subgraphs/name/okx-mainnet/exchange",
// };

// const fetch = univ2Adapter({
//   endpoints,
//   factoriesName: "pancakeFactories",
//   dayData: "pancakeDayData"
// });

const adapter: SimpleAdapter = {
  version: 2,
  fetch: getUniV2LogAdapter({ factory: '0xa38498983e7b31DE851e36090bc9D1D8fB96BE5E', userFeesRatio: 1 }),
  chains: [CHAIN.XLAYER],
  start: 1713225600,
}

export default adapter;
