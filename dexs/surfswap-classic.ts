import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV2LogAdapter } from "../helpers/uniswap";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.KAVA]: {
      fetch: getUniV2LogAdapter({ factory: '0xc449665520C5a40C9E88c7BaDa149f02241B1f9F'}),
      start: '2022-08-05',
    },
  }
}

export default adapter;
