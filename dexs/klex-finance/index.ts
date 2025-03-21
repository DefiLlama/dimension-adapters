import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
import { getFeesExport } from "../../helpers/balancer";

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.KLAYTN]: {fetch: getFeesExport('0xb519Cf56C63F013B0320E89e1004A8DE8139dA27'), },
  },
  version: 2,
};
export default adapters;
