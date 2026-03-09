// TideSwap Aggregator Volume Adapter
// Repo: DefiLlama/dimension-adapters
// Path: aggregators/tideswap/index.ts
//
// TideSwap is a meta-aggregator on Ink L2 that compares 0x and LI.FI.
// Volume is back-calculated from the 0.05% integrator fee sent to treasury.
// volume = fee_amount / 0.0005
// LI.FI-routed swaps (0% fee) are not counted as there is no on-chain trace.

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

const TREASURY = "0x647128722e6aC0FDF10C1c5bEB9d37C66cE6f907";
const FEE_BPS = 5; // 0.05% = 5 bps

const INK_TOKENS = [
  "0x4200000000000000000000000000000000000006", // WETH
  "0x2d270e6886d130d724215a266106e6832161eaed", // USDC
  "0x0200c29006150606b650577bbe7b6248f58470c1", // USDT0
];

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  // Get fee amounts received by treasury
  const dailyFees = await addTokensReceived({
    options,
    tokens: INK_TOKENS,
    targets: [TREASURY],
  });

  // await getETHReceived({
  //   options,
  //   target: TREASURY,
  //   balances: dailyFees,
  // });

  // Back-calculate volume: volume = fees / 0.0005 = fees * 2000
  const feeEntries = dailyFees.getBalances();
  for (const [token, amount] of Object.entries(feeEntries)) {
    dailyVolume.add(token, BigInt(amount) * BigInt(10000) / BigInt(FEE_BPS));
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.INK]: {
      fetch,
      start: "2025-02-22",
    },
  },
  methodology: {
    Volume: "Aggregated swap volume on Ink L2, back-calculated from the 0.05% integrator fee collected by the TideSwap treasury on 0x-routed swaps.",
    Fees: "TideSwap charges a 0.05% integrator fee on swaps routed through 0x. LI.FI-routed swaps have no TideSwap fee.",
    Revenue: "100% of fees go to the TideSwap treasury (Gnosis Safe).",
    ProtocolRevenue: "All revenue is protocol revenue.",
  }
};

export default adapter;
