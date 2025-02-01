import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { getSolanaReceived } from "../helpers/token"


const fethcFeesSolana = async (options: FetchOptions) => {
  // limit order fees
  const dailyFees = await getSolanaReceived({ options, target: '27ZASRjinQgXKsrijKqb9xyRnH6W5KWgLSDveRghvHqc' })
  return { dailyFees, dailyRevenue: dailyFees }
}


const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fethcFeesSolana,
      start: '2023-06-01',
    },
  },
  isExpensiveAdapter: true,
}

export default adapter
