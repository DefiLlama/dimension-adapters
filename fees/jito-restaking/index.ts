import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { getSolanaReceived } from "../helpers/token"

const fetchFees = async (options: FetchOptions) => {

  const targets = [
    '5eosrve6LktMZgVNszYzebgmmC7BjLK8NoWyRQtcmGTF',
  ]

  const dailyFees = await getSolanaReceived({ options, targets, })

  return {
    dailyFees: dailyFees,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetchFees,
      start: '2024-04-30',
    }
  },
  isExpensiveAdapter: true
}

export default adapter
