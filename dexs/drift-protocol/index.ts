import { CHAIN } from '../../helpers/chains'
import { BreakdownAdapter, Dependencies, FetchOptions } from '../../adapters/types'
import { prefetch, fetchDimensions } from '../../helpers/drift'

const adapter: BreakdownAdapter = {
  breakdown: {
    swap: {
      [CHAIN.SOLANA]: {
        fetch: (_t: any, _tt: any, options: FetchOptions) => fetchDimensions('spot', options),
        start: '2023-07-25',
      },
    },
    derivatives: {
      [CHAIN.SOLANA]: {
        fetch: (_t: any, _tt: any, options: FetchOptions) => fetchDimensions('perp', options),
        start: '2023-07-25',
      },
    },
  },
  prefetch,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
}

export default adapter
