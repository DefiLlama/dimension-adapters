import { CHAIN } from '../../helpers/chains'
import { FetchOptions } from '../../adapters/types'
import { httpGet } from '../../utils/fetchURL'
import { METRIC } from '../../helpers/metrics'

const breakdownMethodology = {
  Fees: {
    [METRIC.LP_FEES]: 'Fees paid by traders on token swaps, distributed to liquidity providers',
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: 'Fees paid by traders on token swaps, distributed to liquidity providers',
  }
}

export default {
  version: 2,
  methodology: {
    Fees: 'Fees collected from borrowers and traders.',
    SupplySideRevenue: 'All the fees collected from borrowers and traders are distributed to liquidity providers.',
  },
  breakdownMethodology,
  runAtCurrTime: true,
  start: '2023-11-14',
  adapter: {
    [CHAIN.ICON]: {
      fetch: async ({ createBalances }: FetchOptions) => {
        const dailyVolume = createBalances()
        const dailyFees = createBalances()
        const data = await httpGet('https://balanced.icon.community/api/v1/pools')
        data.forEach((pool: any) => {
          dailyVolume.add(pool.base_address, pool.base_volume_24h * (10 ** pool.base_decimals))
          dailyVolume.add(pool.quote_address, pool.quote_volume_24h * (10 ** pool.quote_decimals))
          dailyFees.add(pool.base_address, pool.base_lp_fees_24h * (10 ** pool.base_decimals), METRIC.LP_FEES)
          dailyFees.add(pool.quote_address, pool.quote_lp_fees_24h * (10 ** pool.quote_decimals), METRIC.LP_FEES)
        })
        return { dailyVolume, dailyFees, dailyRevenue: 0, dailySupplySideRevenue: dailyFees }
      },
    },
  }
}