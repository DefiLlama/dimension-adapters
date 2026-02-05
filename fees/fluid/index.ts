import { Adapter, Fetch, FetchOptions } from "../../adapters/types";
import { CONFIG_FLUID, FLUID_METRICS } from "./config";
import { getDailyFees } from "./fees";
import { getDailyRevenue, getDailyHoldersRevenue } from "./revenue";

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

const adapter: Adapter = {
  methodology: {
    Fees: "Interest paid by borrowers",
    Revenue: "Percentage of interest going to treasury",
    ProtocolRevenue: "Percentage of interest going to treasury",
    SupplySideRevenue: "Percentage of interest are distributed to lenders.",
    HoldersRevenue: "Token buyback from the treasury",
  },
  breakdownMethodology: {
    Fees: {
      [FLUID_METRICS.BorrowInterest]: "All interests paid by borrowers.",
    },
    Revenue: {
      [FLUID_METRICS.BorrowInterestToTreasury]: "Percentage of interest going to treasury.",
    },
    ProtocolRevenue: {
      [FLUID_METRICS.BorrowInterestToTreasury]: "Percentage of interest going to treasury.",
    },
    SupplySideRevenue: {
      [FLUID_METRICS.BorrowInterestToLenders]: "Amount of interests are distributed to lenders.",
    },
    HoldersRevenue: {
      [FLUID_METRICS.TokenBuyBack]: "FLUID token buyback from the treasury.",
    },
  },
  fetch,
  adapter: CONFIG_FLUID,
}

export default adapter