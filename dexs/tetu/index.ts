import { CHAIN } from "../../helpers/chains";
import { getUniV2LogAdapter } from "../../helpers/uniswap";
import { SimpleAdapter } from "../../adapters/types";

// const fetch = univ2Adapter({
//   endpoints: {
//     [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('D1aLXNYC1pZocgumq9yyKQMjFwZ14Gum3NUbZUA35Gty')
//   },
// });

const adapter: SimpleAdapter = {
  version: 2,
  fetch: getUniV2LogAdapter({ factory: '0x684d8c187be836171a1af8d533e4724893031828' }),
  chains: [CHAIN.POLYGON],
  start: 1634863038,
}

export default adapter;
