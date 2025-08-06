import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

const adapter: SimpleAdapter = {
  version: 2,
  fetch: getUniV2LogAdapter({ factory: '0x477Ce834Ae6b7aB003cCe4BC4d8697763FF456FA' }),
  chains: [CHAIN.POLYGON],
}

export default adapter;