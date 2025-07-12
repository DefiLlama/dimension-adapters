import { Balances } from '@defillama/sdk'
import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import multiswapVolume from '../dexs/multiswap'

const volumeFetch = multiswapVolume.adapter[CHAIN.DCHAIN].fetch as any

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.DCHAIN]: {
      fetch: async (options: FetchOptions) => {
        const res: any = await volumeFetch(options)
        const fees = res.dailyFees as Balances
        const dailyRevenue = fees.clone()
        return {
          dailyFees: fees,
          dailyRevenue,
        }
      },
      start: '2024-01-01',
    },
  },
}

export default adapter 