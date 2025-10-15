import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

const adapter: SimpleAdapter = {
  version: 2,
  fetch: getUniV2LogAdapter({ factory: '0xe1F0D4a5123Fd0834Be805d84520DFDCd8CF00b7' }),
  chains: [CHAIN.ULTRON],
  start: 1659323793,
}

export default adapter;