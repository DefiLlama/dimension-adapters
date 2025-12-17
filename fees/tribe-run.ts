import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { getSolanaReceived } from "../helpers/token"

const fetchFees = async (_: any, _1: any, options: FetchOptions) => {
  const targets = [
    '2gsCTYYQUE7Ty5cDHa2FsjDC7Q95qBxywnFAT5C7RU9V',
  ]
  const dailyRevenue = await getSolanaReceived({ options, targets: targets })
  const dailyFees = dailyRevenue.clone(1 + (1 / 2) + (1 / 0.6))
  return { dailyFees, dailyRevenue, }
}

const adapters: SimpleAdapter = {
  version: 1,
  dependencies: [Dependencies.ALLIUM],
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetchFees,
    }
  },
  methodology: {
    Fees: "Trading fees paid by users on Tribe.run.",
    Revenue: "Portion of fees collected by Tribe.run.",
  }
}

export default adapters
