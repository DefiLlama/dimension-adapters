import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getJupiterStatsRevenue } from "../../helpers/jupiter-stats";

// Jupiter's stats API (subproduct "lend_dex"). Onchain alternative: Dune jupiter_lend_solana dex_call_swap_in/swap_out
// (program jupZ4m2GqUCJ5iueMfzQf8khFfH31d4XAQt3RzCT9Vd), fee = leg amount x fee / 1e6 with the fee and revenue_cut in force
// from dex_call_init_dex / dex_call_update_fee_and_revenue_cut; protocol cut = fee x revenue_cut / 1e6, split with Fluid.
const LABELS = {
  fees: "Jupiter Lend Dex Swap Fees",
  revenue: "Jupiter Lend Dex Swap Fees to Protocol",
  supplySide: "Jupiter Lend Dex Swap Fees to LPs and Fluid",
};

const fetch = async (options: FetchOptions) => {
  const { dailyFees, dailyRevenue, dailySupplySideRevenue } = await getJupiterStatsRevenue(options, { lend_dex: LABELS });
  return { dailyFees, dailySupplySideRevenue, dailyRevenue, dailyProtocolRevenue: dailyRevenue };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2026-06-22',
  methodology: {
    Fees: "Swap fees paid by traders on Jupiter Lend DEX pools.",
    Revenue: "Jupiter's share of the protocol cut of swap fees.",
    ProtocolRevenue: "All of Jupiter's share, kept by Jupiter. Not used for JUP buybacks.",
    SupplySideRevenue: "Swap fees kept by liquidity providers, and Fluid's share of the protocol cut.",
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.fees]: "Swap fees paid by traders on Jupiter Lend DEX pools.",
    },
    Revenue: {
      [LABELS.revenue]: "Jupiter's share of the protocol cut of swap fees.",
    },
    ProtocolRevenue: {
      [LABELS.revenue]: "All of Jupiter's share, kept by Jupiter.",
    },
    SupplySideRevenue: {
      [LABELS.supplySide]: "Swap fees kept by liquidity providers, and Fluid's share of the protocol cut.",
    },
  },
};

export default adapter;
