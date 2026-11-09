import { Dependencies, FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { CARDBOARD_START, fetchCardboardNewUsers } from '../helpers/cardboard-trade'

const fetch = async (options: FetchOptions) => {
  return { dailyNewUsers: await fetchCardboardNewUsers(options) }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: CARDBOARD_START,
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    NewUsers: 'Wallets that opened their first Cardboard Trade position that day.',
  },
}

export default adapter
