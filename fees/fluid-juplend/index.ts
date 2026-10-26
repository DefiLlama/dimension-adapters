import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { FLUID_METRICS } from "../fluid/config";
import { queryJupLendRows } from "../jupiter-lend";

// Fluid's 50% revenue share from Jupiter Lend (Solana).
// Split out of fees/fluid (Solana leg, deadFrom 2026-10-24) so that the JupLend Dune MV lag
// (~2 days, queryJupLendRows throws until the day is complete) no longer blocks Fluid's EVM chains.
const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  // same rows as fees/jupiter-lend, throws until Jupiter's MV has the whole day
  const data = await queryJupLendRows(options);
  const jupiterRevenue = data.reduce((sum, row) => sum + (row.daily_revenue_usd || 0), 0);
  dailyFees.addUSDValue(jupiterRevenue * 0.5, FLUID_METRICS.RevenueShareFromJupLend);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailyHoldersRevenue: 0,
    dailySupplySideRevenue: 0,
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2026-10-25',
  methodology: {
    Fees: "Fluid's 50% revenue share from Jupiter Lend.",
    Revenue: "Fluid's 50% revenue share from Jupiter Lend.",
    ProtocolRevenue: "Fluid's 50% revenue share from Jupiter Lend.",
    SupplySideRevenue: "No supply side revenue, borrower interest to lenders is counted in jupiter-lend.",
    HoldersRevenue: "No holders revenue from this share.",
  },
  breakdownMethodology: {
    Fees: {
      [FLUID_METRICS.RevenueShareFromJupLend]: "Revenue share from JupLend.",
    },
    Revenue: {
      [FLUID_METRICS.RevenueShareFromJupLend]: "Revenue share from JupLend.",
    },
    ProtocolRevenue: {
      [FLUID_METRICS.RevenueShareFromJupLend]: "Revenue share from JupLend.",
    },
  },
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
}

export default adapter
