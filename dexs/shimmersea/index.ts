import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SHIMMER_EVM]: {
      fetch: getUniV2LogAdapter({
        factory: "0x4fb5d3a06f5de2e88ce490e2e11d22b840d5ac47",
      }),
      start: '2023-10-04',
    },
  },
};
export default adapter;
