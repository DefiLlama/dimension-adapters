import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { getSolanaReceived } from "../helpers/token"

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const targets = [
    '2gsCTYYQUE7Ty5cDHa2FsjDC7Q95qBxywnFAT5C7RU9V',
  ]
  const dailyRevenue = await getSolanaReceived({ options, targets: targets })
  const dailyFees = dailyRevenue.clone(1 + (1 / 2) + (1 / 0.6))
  const dailySupplySideRevenue = dailyFees.clone()
  dailySupplySideRevenue.subtract(dailyRevenue)
  return { dailyFees, dailyRevenue, dailySupplySideRevenue }
}

const adapters: SimpleAdapter = {
  version: 1,
  dependencies: [Dependencies.ALLIUM],
  fetch,
  chains: [CHAIN.SOLANA],
  methodology: {
    Fees: "Trading fees paid by users on Tribe.run.",
    Revenue: "Portion of fees collected by Tribe.run.",
    SupplySideRevenue: "The portion of trading fees paid to token creators and chat members"
  }
}

export default adapters
