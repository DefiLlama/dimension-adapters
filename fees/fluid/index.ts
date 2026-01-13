import { Adapter, Fetch, FetchOptions } from "../../adapters/types";
import { METRIC } from "../../helpers/metrics";
import { CONFIG_FLUID } from "./config";
import { getDailyFees } from "./fees";
import { getDailyRevenue, getDailyHoldersRevenue } from "./revenue";

const fetch: Fetch = async (_t: any, _a: any, options: FetchOptions) => {
  const [dailyFees, dailyRevenue, dailyHoldersRevenue] = await Promise.all([
    getDailyFees(options),
    getDailyRevenue(options),
    getDailyHoldersRevenue(options)
  ])

  const supplySideRevenue = dailyFees.clone(1)
  supplySideRevenue.subtract(dailyRevenue)
  
  const dailySupplySideRevenue = options.createBalances()
  dailySupplySideRevenue.addBalances(supplySideRevenue, 'Borrow Interest To Lenders')

  console.log(dailyFees.getBreakdownBalances())
  console.log(dailySupplySideRevenue.getBreakdownBalances())
  console.log(dailyRevenue.getBreakdownBalances())
  
  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
    dailyProtocolRevenue: dailyRevenue,
  }
}

const adapter: Adapter = {
  version: 1,
  adapter: Object.entries(CONFIG_FLUID).reduce((acc, [chain, config]) => {
    (acc as any)[chain] = {
      start: config.start,
      fetch
    };
    return acc;
  }, {}),
  methodology: {
    Fees: "Interest paid by borrowers",
    Revenue: "Percentage of interest going to treasury",
    ProtocolRevenue: "Percentage of interest going to treasury",
    SupplySideRevenue: "Borrow interests are distributed to lenders.",
    HoldersRevenue: "Token buyback from the treasury",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.BORROW_INTEREST]: "All interests paid by borrowers.",
    },
    Revenue: {
      "Borrow Interest To Treasury": "Percentage of interest going to treasury.",
    },
    ProtocolRevenue: {
      "Borrow Interest To Treasury": "Percentage of interest going to treasury.",
    },
    SupplySIdeRevenue: {
      "Borrow Interest To Lenders": "Amount of interests are distributed to lenders.",
    },
    HoldersRevenue: {
      [METRIC.TOKEN_BUY_BACK]: "FLUID token buyback from the treasury.",
    },
  },
}

export default adapter