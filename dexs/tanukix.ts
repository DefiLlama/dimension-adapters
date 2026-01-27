import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getFeesExport } from "../helpers/balancer";

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.TAIKO]: {fetch: getFeesExport('0x3251e99cEf4b9bA03a6434B767aa5Ad11ca6cc31'), },
  },
  version: 2,
};
export default adapters;
