import { Dependencies, FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { CARDBOARD_START, fetchCardboardActiveUsers } from '../helpers/cardboard-trade'

const fetch = async (options: FetchOptions) => {
  return { dailyActiveUsers: await fetchCardboardActiveUsers(options) }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: CARDBOARD_START,
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    ActiveUsers: 'Unique wallets that opened or closed a Cardboard Trade position that day. Wallets whose only activity was being liquidated are not counted, since liquidations are submitted by the exchange.',
  },
}

export default adapter
