// TideSwap Fees Adapter
// Repo: DefiLlama/dimension-adapters
// Path: fees/tideswap/index.ts

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived, addGasTokensReceived } from "../../helpers/token";

const TREASURY = "0x647128722e6aC0FDF10C1c5bEB9d37C66cE6f907";

const INK_TOKENS = [
  "0x4200000000000000000000000000000000000006", // WETH
  "0x2d270e6886d130d724215a266106e6832161eaed", // USDC
  "0x0200c29006150606b650577bbe7b6248f58470c1", // USDT0
];

const fetch = async (options: FetchOptions) => {
  const dailyFees = await addTokensReceived({
    options,
    tokens: INK_TOKENS,
    targets: [TREASURY],
  });

  await addGasTokensReceived({
    options,
    multisigs: [TREASURY],
    balances: dailyFees,
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.INK]: {
      fetch,
      start: "2025-02-22",
      meta: {
        methodology: {
          Fees: "TideSwap charges a 0.05% integrator fee on swaps routed through 0x. LI.FI-routed swaps have no TideSwap fee.",
          Revenue: "100% of fees go to the TideSwap treasury (Gnosis Safe).",
          ProtocolRevenue: "All revenue is protocol revenue.",
        },
      },
    },
  },
};

export default adapter;
