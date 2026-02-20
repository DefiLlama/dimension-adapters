import { FetchResultV2 } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import fetchURL, { postURL } from '../../utils/fetchURL'

const fetchFees = async (): Promise<FetchResultV2> => {
  const res = await fetchURL(
    'https://api.torch.finance/stats/daily-fees',
  )

  return {
    dailyFees: res.dailyUserFees,
    dailyUserFees: res.dailyUserFees,
    dailyRevenue: res.dailyRevenue,
    dailySupplySideRevenue: res.dailySupplySideRevenue
  }
}

export default {
  methodology: {
    UserFees: 'User pays fee on each swap (depends on pool, 0.1% - 1%).',
    Revenue: 'Protocol receives 50% of fees.',
    SupplySideRevenue:
      '50% of user fees are paid to liquidity providers, increasing the pool size.',
  },
  version: 2,
  adapter: {
    [CHAIN.TON]: {
      start: '2023-11-14',
      fetch: fetchFees,
      runAtCurrTime: true,
    },
  },
}
