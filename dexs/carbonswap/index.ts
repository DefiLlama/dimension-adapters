import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

const adapter: SimpleAdapter = {
  version: 2,
  fetch: getUniV2LogAdapter({ factory: '0x17854c8d5a41d5A89B275386E24B2F38FD0AfbDd' }),
  chains: [CHAIN.ENERGYWEB],
  start: 1618446893,
}

export default adapter;
