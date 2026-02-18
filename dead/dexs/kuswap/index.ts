import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

// const fetch = univ2Adapter({
//   endpoints: {
//     [CHAIN.KCC]: "https://info.kuswap.finance/subgraphs/name/kuswap/swap",
//   },
// });

const adapter: SimpleAdapter = {
  version: 2,
  deadFrom: '2025-07-28',
  fetch: getUniV2LogAdapter({ factory: '0xAE46cBBCDFBa3bE0F02F463Ec5486eBB4e2e65Ae' }),
  chains: [CHAIN.KCC],
  start: '2021-06-27',
}

export default adapter;
