import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getFeesExport } from "../../helpers/balancer";

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.GODWOKEN_V1]: {
      fetch: getFeesExport('0x4f8bdf24826ebcf649658147756115ee867b7d63',),
    },
  },
  version: 2,
};
export default adapters;
