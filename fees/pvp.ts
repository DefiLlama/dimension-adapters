import { CHAIN } from '../helpers/chains'
import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { fetchHyperliquidBuilderFees } from '../helpers/hyperliquid'

const PVP_ADDRESS = '0x0cbf655b0d22ae71fba3a674b0e1c0c7e7f975af'

const fetchHL = async (options: FetchOptions) => {
  const { dailyFees, dailyRevenue, dailyProtocolRevenue } = await fetchHyperliquidBuilderFees({ fetchOptions: options, referralAddress: PVP_ADDRESS });

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch: fetchHL,
    }
  },
  isExpensiveAdapter: true,
}

export default adapter;
