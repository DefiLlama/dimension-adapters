import { Balances } from '@defillama/sdk'
import { FetchOptions, FetchResultV2, FetchV2, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { uniV3Exports } from '../../helpers/uniswap'

const graphql = uniV3Exports({
  [CHAIN.SCROLL]: { factory: '0xAAA32926fcE6bE95ea2c51cB4Fcb60836D320C42' }
})

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SCROLL]: {
      fetch: async (options: FetchOptions) => {
        const res: FetchResultV2 = await (graphql.adapter[CHAIN.SCROLL].fetch as FetchV2)(options)
        const fees = res.dailyFees as Balances
        const dailyRevenue = fees.clone()
        dailyRevenue.resizeBy(0.8);
        return {
          dailyFees: fees,
          dailyRevenue,
        }
      },
      start: '2024-05-02',
    },
  }
}
export default adapter
