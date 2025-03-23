import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getFeesExport } from "../../helpers/balancer";

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.BSC]: {fetch: getFeesExport('0xee1c8dbfbf958484c6a4571f5fb7b99b74a54aa7'), },
  },
  version: 2,
};
export default adapters;
