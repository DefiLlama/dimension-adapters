import { SimpleAdapter } from "../../adapters/types";
import { getFeesExport } from "../../helpers/balancer";
import { CHAIN } from "../../helpers/chains";

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.CRONOS]: {fetch: getFeesExport('0x92631e0e84ff01853ef1bb88fc9c9f7d1e1af1ca'), },
  },
  version: 2,
};
export default adapters;
