import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getFeesExport } from "../helpers/balancer";

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.AURORA]: {fetch: getFeesExport('0x6985436a0E5247A3E1dc29cdA9e1D89C5b59e26b'), },
    [CHAIN.TELOS]: {fetch: getFeesExport('0x9Ced3B4E4DC978265484d1F1f569010E13f911c9'), },
  },
  version: 2,
};
export default adapters;
