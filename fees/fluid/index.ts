import { Adapter, Dependencies, Fetch, FetchOptions } from "../../adapters/types";
import { CONFIG_FLUID, FLUID_METRICS } from "./config";
import { getDailyFees } from "./fees";
import { getDailyRevenue, getDailyHoldersRevenue } from "./revenue";
import { getSqlFromFile, queryDuneSql } from "../../helpers/dune";
import { CHAIN } from "../../helpers/chains";

const fetch: Fetch = async (_t: any, _a: any, options: FetchOptions) => {
  const [dailyFees, dailyRevenue, dailyHoldersRevenue] = await Promise.all([
    getDailyFees(options),
    getDailyRevenue(options),
    getDailyHoldersRevenue(options)
  ])

  const dailyFeesUSD = await dailyFees.getUSDValue()
  const dailyRevenueUSD = await dailyRevenue.getUSDValue()
  
  const dailySupplySideRevenue = options.createBalances()
  dailySupplySideRevenue.addUSDValue(dailyFeesUSD - dailyRevenueUSD, FLUID_METRICS.BorrowInterestToLenders)
  
  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
    dailyProtocolRevenue: dailyRevenue,
  }
}

// Revenu share from Jupiter Lend
const fetchSolana: Fetch = async (_t: any, _a: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  
  // get JupLend revenue
  const sql = getSqlFromFile("helpers/queries/jupiter-lend.sql", {
    start: options.startTimestamp,
    end: options.endTimestamp
  });
  const data: any[] = await queryDuneSql(options, sql);
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

const adapter: Adapter = {
  methodology: {
    Fees: "Interest paid by borrowers on Fluid + revenue share from JupLend",
    Revenue: "Percentage of interest going to treasury",
    ProtocolRevenue: "Percentage of interest going to treasury",
    SupplySideRevenue: "Percentage of interest are distributed to lenders.",
    HoldersRevenue: "Token buyback from the treasury",
  },
  breakdownMethodology: {
    Fees: {
      [FLUID_METRICS.BorrowInterest]: "All interests paid by borrowers.",
      [FLUID_METRICS.RevenueShareFromJupLend]: "Revenue share from JupLend.",
    },
    Revenue: {
      [FLUID_METRICS.BorrowInterestToTreasury]: "Percentage of interest going to treasury.",
      [FLUID_METRICS.RevenueShareFromJupLend]: "Revenue share from JupLend.",
    },
    ProtocolRevenue: {
      [FLUID_METRICS.BorrowInterestToTreasury]: "Percentage of interest going to treasury.",
      [FLUID_METRICS.RevenueShareFromJupLend]: "Revenue share from JupLend.",
    },
    SupplySideRevenue: {
      [FLUID_METRICS.BorrowInterestToLenders]: "Amount of interests are distributed to lenders.",
    },
    HoldersRevenue: {
      [FLUID_METRICS.TokenBuyBack]: "FLUID token buyback from the treasury.",
    },
  },
  fetch,
  adapter: {
    ...CONFIG_FLUID,
    [CHAIN.SOLANA]: {
      fetch: fetchSolana,
      start: '2025-07-24',
    }
  },
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
}

export default adapter