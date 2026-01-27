import { SimpleAdapter } from "../adapters/types";
import { getFeesExport } from "../helpers/balancer";

const adapters: SimpleAdapter = {
  adapter: {
    avax: {fetch: getFeesExport('0xad68ea482860cd7077a5d0684313dd3a9bc70fbb'), },
  },
  version: 2,
};
export default adapters;
