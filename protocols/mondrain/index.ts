import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
import { getFeesExport } from "../../helpers/balancer";

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.ABSTRACT]: {fetch: getFeesExport('0x48cD08ad2065e0cD2dcD56434e393D55A59a4F64'), },
  },
  version: 2,
};
export default adapters;
