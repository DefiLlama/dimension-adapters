import { SimpleAdapter } from "../adapters/types";
import { getFeesExport } from "../helpers/balancer";

const adapters: SimpleAdapter = {
  adapter: {
    arbitrum: {fetch: getFeesExport('0x25898DEe0634106C2FcBB51B3DB5b14aA1c238a4'), },
  },
  version: 2,
};
export default adapters;
