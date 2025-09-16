import { CHAIN } from "../helpers/chains"
import { findClosest } from "../helpers/utils/findClosest";
import { httpGet } from "../utils/fetchURL";
import { BreakdownAdapter, FetchOptions } from "../adapters/types";
import { METRIC } from "../helpers/metrics";

let data: any
async function getAllData() {
  return (await httpGet(`https://api.hypurrscan.io/fees`)).map((t: any) => ({ ...t, time: t.time * 1e3 }))
}

// fees source: https://hyperdash.info/statistics
const fetch = (market_type: string) => {
  return async (options: FetchOptions) => {
    if (!data) data = getAllData()
    data = await data

    const dailyFees = options.createBalances()
    const startCumFees: any = findClosest(options.startTimestamp, data, 3600)
    const endCumFees: any = findClosest(options.endTimestamp, data, 3600)

    const totalFees = (endCumFees.total_fees - startCumFees.total_fees) / 1e6;
    const totalSpotFees = (endCumFees.total_spot_fees - startCumFees.total_spot_fees) / 1e6;

    if (market_type === "spot" || market_type === "perp") {
      market_type === "spot" ? dailyFees.addUSDValue(totalSpotFees, 'Trade fees') : dailyFees.addUSDValue(totalFees - totalSpotFees, 'Trade fees');

      // confirm from hyperliquid team
      // before 30 Aug, 97% of fees go to Assistance Fund for burning tokens, remaining 3% go to HLP Vault
      // after 30 Aug, 99% of fees go to Assistance Fund for burning tokens, remaining 1% go to HLP Vault
      const dailyRevenue = dailyFees.clone(options.startTimestamp >= 1756512000 ? 0.99 : 0.97);

      return {
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue,
        dailyHoldersRevenue: dailyRevenue.clone(1, METRIC.TOKEN_BUY_BACK),
        dailyProtocolRevenue: 0,
        dailySupplySideRevenue: 0
      }
    }
    else {
      dailyFees.addUSDValue(totalFees, 'Trade fees')
      const dailySupplySideRevenue = dailyFees.clone(options.startTimestamp >= 1756512000 ? 0.01 : 0.03, 'HLP');

      return {
        dailyFees: dailySupplySideRevenue,
        dailySupplySideRevenue,
      }
    }
  }
}

const adapters: BreakdownAdapter = {
  version: 2,
  breakdown: {
    spot: {
      [CHAIN.HYPERLIQUID]: {
        fetch: fetch("spot"),
      },
    },
    perp: {
      [CHAIN.HYPERLIQUID]: {
        fetch: fetch("perp"),
      },
    },
    hlp: {
      [CHAIN.HYPERLIQUID]: {
        fetch: fetch("hlp")
      }
    }
  },
};

export default adapters;
