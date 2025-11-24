import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV3LogAdapter } from "../helpers/uniswap";

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.MONAD],
  fetch: getUniV3LogAdapter({ factory: "0x02a898F85a6984213Ac6d2577ff3406394172abf" })
};

export default adapter;
