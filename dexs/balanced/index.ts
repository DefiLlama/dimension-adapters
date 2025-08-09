import { CHAIN } from '../../helpers/chains'
import { FetchOptions } from '../../adapters/types'
import { httpGet } from '../../utils/fetchURL'

export default {
  version: 2,
  methodology: {
    Fees: 'Fees: Collected from borrowers and traders.',
    TVL: 'TVL: The total liquidity held on the Balanced exchange and used as collateral for bnUSD.',
    DataSource: 'Data is sourced from the Balanced Network API and ICON Tracker RPC Node. It is processed to calculate trading fees and volume accrued over a 24-hour period. Stats can be verified at https://stats.balanced.network/'
  },
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
          dailyFees.add(pool.base_address, pool.base_lp_fees_24h * (10 ** pool.base_decimals))
          dailyFees.add(pool.quote_address, pool.quote_lp_fees_24h * (10 ** pool.quote_decimals))
        })
        return { dailyVolume, dailyFees, }
      },
    },
  }
}