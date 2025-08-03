import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

// const endpoints = {
//   [CHAIN.FANTOM]: sdk.graph.modifyEndpoint('3kxULFsyJPAqbtCQUtQBH4Hktd6EboqCF22cVtkZg1eY'),
// };

const adapter: SimpleAdapter = {
  version: 2,
  fetch: getUniV2LogAdapter({ factory: '0x535646cf57E4155Df723bb24625f356d98ae9D2F' }),
  chains: [CHAIN.FANTOM],
  start: 1650883041,
}

export default adapter;
