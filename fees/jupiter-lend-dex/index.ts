import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getJupiterStatsRevenue } from "../../helpers/jupiter-stats";

// Jupiter's stats API. Onchain method, using the decoded calls of program jupZ4m2GqUCJ5iueMfzQf8khFfH31d4XAQt3RzCT9Vd
// (jupiter_lend_solana in Dune):
// - Fee per swap = leg amount x fee / 1e6: amount_in on dex_call_swap_in, amount_out on dex_call_swap_out, in that
//   leg's token. The pool's tokens come from the swap calls (dex_call_init_dex only for pools that have not traded).
// - The fee and revenue_cut in force at the swap come from dex_call_init_dex and every later
//   dex_call_update_fee_and_revenue_cut, joined on block time.
// - Protocol cut = fee x revenue_cut / 1e6; the LPs keep the rest. Jupiter keeps part of the protocol cut.
const fetch = async (options: FetchOptions) => {
  const { dailyFees, dailyRevenue, dailySupplySideRevenue } = await getJupiterStatsRevenue(options, {
    lend_dex: {
      fees: "Jupiter Lend Dex Swap Fees",
      revenue: "Jupiter Lend Dex Swap Fees to Protocol",
      supplySide: "Jupiter Lend Dex Swap Fees to LPs and Fluid",
    },
  });
  return { dailyFees, dailySupplySideRevenue, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(1) };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2026-06-22',
  methodology: {
    Fees: "Total swap fees on Jupiter Lend DEX pools, from Jupiter's stats API.",
    SupplySideRevenue: "Swap fees not kept by Jupiter: the LP share and Fluid's share of the protocol cut.",
    Revenue: "Jupiter's share of the protocol cut, from Jupiter's stats API.",
    ProtocolRevenue: "Jupiter's share of the protocol cut, from Jupiter's stats API.",
  },
  breakdownMethodology: {
    Fees: {
      "Jupiter Lend Dex Swap Fees": "Total swap fees on Jupiter Lend DEX pools.",
    },
    Revenue: {
      "Jupiter Lend Dex Swap Fees to Protocol": "Jupiter's share of the protocol cut.",
    },
    ProtocolRevenue: {
      "Jupiter Lend Dex Swap Fees to Protocol": "Jupiter's share of the protocol cut.",
    },
    SupplySideRevenue: {
      "Jupiter Lend Dex Swap Fees to LPs and Fluid": "Swap fees not kept by Jupiter: the LP share and Fluid's share of the protocol cut.",
    },
  },
};

export default adapter;
