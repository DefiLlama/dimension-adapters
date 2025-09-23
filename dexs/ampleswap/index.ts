import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

const adapter: SimpleAdapter = {
  version: 2,
  fetch: getUniV2LogAdapter({ factory: '0x381fefadab5466bff0e8e96842e8e76a143e8f73' }),
  chains: [CHAIN.BSC],
  start: '2021-09-10',
}

export default adapter;