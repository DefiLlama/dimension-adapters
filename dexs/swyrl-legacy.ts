import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV2LogAdapter } from "../helpers/uniswap";

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.MONAD],
  fetch: getUniV2LogAdapter({
    factory: "0xD158CDfeC90E9429A290c3144Afeb72E8C23603a",
  }),
};

export default adapter;
