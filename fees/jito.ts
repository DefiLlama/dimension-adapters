import { time } from "console"
import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { queryDune } from "../helpers/dune"

const fetchFees = async (_: any, _t: any, options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const result = await queryDune("3733728", {
    start: options.startOfDay,
    end: options.startOfDay + 86400,
  });
  dailyFees.add('So11111111111111111111111111111111111111112', result[0].sol_tip * 1e9)
  dailyRevenue.add('So11111111111111111111111111111111111111112', result[0].sol_tip * 1e9)
  dailyRevenue.resizeBy(0.04)

  return {
    dailyFees: dailyFees,
    dailyRevenue: dailyRevenue,
    timestamp: options.startOfDay
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetchFees,
      runAtCurrTime: true,
      start: 1714435200,
    }
  },
  isExpensiveAdapter: true
}

export  default adapter
