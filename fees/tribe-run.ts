import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { getSolanaReceived } from "../helpers/token"

const fetchFees = async (options: FetchOptions) => {
  const targets = [
    '2gsCTYYQUE7Ty5cDHa2FsjDC7Q95qBxywnFAT5C7RU9V',
  ]
  const dailyRevenue = await getSolanaReceived({ options, targets: targets })
  const dailyFees = dailyRevenue.clone(1 + (1/2) + (1/0.6))
  return { dailyFees, dailyRevenue, }
}

const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetchFees,
    }
  }
}

export default adapters
