import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getFeesExport } from "../helpers/balancer";

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.BASE]: {fetch: getFeesExport('0x7122e35ceC2eED4A989D9b0A71998534A203972C'), },
    [CHAIN.NEON]: {fetch: getFeesExport('0x7122e35ceC2eED4A989D9b0A71998534A203972C'), },
  },
  version: 2,
};
export default adapters;

