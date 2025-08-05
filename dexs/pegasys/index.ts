import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

const adapter: SimpleAdapter = {
  version: 2,
  fetch: getUniV2LogAdapter({ factory: '0x7Bbbb6abaD521dE677aBe089C85b29e3b2021496' }),
  chains: [CHAIN.SYSCOIN],
}

export default adapter;