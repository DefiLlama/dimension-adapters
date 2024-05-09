import { Chain } from "@defillama/sdk/build/general";
import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getFeesExport } from "../helpers/balancer";

type TAddress = {
  [s: string | Chain]: string;
}
const vaultAddresses: TAddress = {
  [CHAIN.OPTIMISM]: "0xba12222222228d8ba445958a75a0704d566bf2c8",
  [CHAIN.FANTOM]: "0x20dd72ed959b6147912c2e529f0a0c651c33c9ce",
}

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.OPTIMISM]: { fetch: getFeesExport(vaultAddresses[CHAIN.OPTIMISM]), start: 1672531200 },
    [CHAIN.FANTOM]: { fetch: getFeesExport(vaultAddresses[CHAIN.FANTOM]), start: 1672531200 },
  },
  version: 2,
}
export default adapters
