import { FetchOptions } from "../adapters/types"
import { getETHReceived } from "../helpers/token"


const fetchFees = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
      await getETHReceived({ options, balances: dailyFees, targets: address})

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  }
}

const adapter = {
  version: 2,
  adapter: {
    ethereum: {
      fetch: fetchFees,
    },
  },
}

export default adapter
