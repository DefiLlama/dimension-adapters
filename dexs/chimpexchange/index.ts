import { SimpleAdapter } from "../../adapters/types";
import { getFeesExport } from "../../helpers/balancer";
import { CHAIN } from "../../helpers/chains";

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.LINEA]: {fetch: getFeesExport('0x286381aEdd20e51f642fE4A200B5CB2Fe3729695'), },
  },
  version: 2,
};
export default adapters;
