import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { getSolanaReceived } from "../helpers/token"


const fethcFeesSolana = async (options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({ options, targets: [
    'CpoD6tWAsMDeyvVG2q2rD1JbDY6d4AujnvAn2NdrhZV2'
  ]})
  const dailyRevenue = dailyFees.clone()
  dailyRevenue.resizeBy(0.25)
  return { dailyFees, dailyRevenue: dailyRevenue }
}


const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fethcFeesSolana,
      start: '2024-01-01',
    },
  },
  isExpensiveAdapter: true,
}

export default adapter
