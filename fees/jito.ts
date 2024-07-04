import { time } from "console"
import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { queryDune } from "../helpers/dune"

const fetchFees = async (_a:any, _: any,options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const result = await queryDune("3740661");
  const dateStr = new Date(options.startOfDay * 1000).toISOString().split('T')[0]
  const day = result.find((r: any) => r.day === dateStr)
  dailyFees.add('So11111111111111111111111111111111111111112', day.sol_tip * 1e9)
  dailyRevenue.add('So11111111111111111111111111111111111111112', day.sol_tip * 1e9)
  dailyRevenue.resizeBy(0.04)

  return {
    timestamp: options.startOfDay,
    dailyFees: dailyFees,
    dailyRevenue: dailyRevenue,
  }
}

const adapter: SimpleAdapter = {
  // version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetchFees,
      start: 1714435200,
    }
  },
  isExpensiveAdapter: true
}

export  default adapter
