import { CHAIN } from "../../helpers/chains";
import { getUniV2LogAdapter } from "../../helpers/uniswap";
import { SimpleAdapter } from "../../adapters/types";

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.ENI],
  fetch: getUniV2LogAdapter({
    factory: "0x548C0E26CE90B333c07abb6d55546304D46d269d",
  }),
  start: "2025-06-01",
};

export default adapter;