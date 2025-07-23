import { Chain } from "../adapters/types";
import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getFeesExport } from "../helpers/balancer";

type TAddress = {
  [s: string | Chain]: string;
};
const vaultAddresses: TAddress = {
  [CHAIN.OPTIMISM]: "0xba12222222228d8ba445958a75a0704d566bf2c8",
  [CHAIN.FANTOM]: "0x20dd72ed959b6147912c2e529f0a0c651c33c9ce",
  [CHAIN.SONIC]: "0xba12222222228d8ba445958a75a0704d566bf2c8",
};

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.OPTIMISM]: { fetch: getFeesExport(vaultAddresses[CHAIN.OPTIMISM], { revenueRatio: 0.25 }), start: '2023-01-01' },
    [CHAIN.FANTOM]: { fetch: getFeesExport(vaultAddresses[CHAIN.FANTOM], { revenueRatio: 0.25 }), start: '2023-01-01' },
    [CHAIN.SONIC]: {fetch: getFeesExport(vaultAddresses[CHAIN.SONIC], { revenueRatio: 0.25 }), start: "2024-12-14" },
  },
  version: 2,
};
export default adapters;
