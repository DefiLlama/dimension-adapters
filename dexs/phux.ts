import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getFeesExport } from "../helpers/balancer";

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.PULSECHAIN]: {fetch: getFeesExport('0x7F51AC3df6A034273FB09BB29e383FCF655e473c'), },
  },
  version: 2,
};
export default adapters;
