import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { getSolanaReceived } from "../helpers/token"


const fethcFeesSolana = async (options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({ options, targets: [
    'CpoD6tWAsMDeyvVG2q2rD1JbDY6d4AujnvAn2NdrhZV2'
  ]})
  const dailyRevenue = dailyFees.clone()
  return { dailyFees, dailyRevenue }
}


const adapter: SimpleAdapter = {
  version: 2,
  dependencies: [Dependencies.ALLIUM],
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fethcFeesSolana,
      start: '2024-01-01',
    },
  },
  isExpensiveAdapter: true,
}

export default adapter
