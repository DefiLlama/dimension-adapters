import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getFeesExport } from "../../helpers/balancer";

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.BOBA]: {
      fetch: getFeesExport('0x2a4409cc7d2ae7ca1e3d915337d1b6ba2350d6a3'), start: '2022-06-13',
    },
  },
  version: 2,
};
export default adapters;
