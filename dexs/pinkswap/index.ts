import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

const adapter: SimpleAdapter = {
  version: 2,
  fetch: getUniV2LogAdapter({ factory: '0x7D2Ce25C28334E40f37b2A068ec8d5a59F11Ea54' }),
  chains: [CHAIN.BSC],
}

export default adapter;