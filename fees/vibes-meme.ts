import { FetchResult, SimpleAdapter, ProtocolType } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { getSolanaReceived } from '../helpers/token'

const VIBES_FEE_ADDRESS = '8w1TF5feq55khx19Hxnem6hyLsK8tK7AjbyNTu3cuR7Q'

const fetch = async (options: any): Promise<FetchResult> => {
  const dailyFees = await getSolanaReceived({
    target: VIBES_FEE_ADDRESS,
    options,
  })

  return {
    timestamp: options.startTimestamp,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
    },
  },
  isExpensiveAdapter: true,
  protocolType: ProtocolType.PROTOCOL,
  methodology: {
    Fees: 'Vibes collects fees from token swaps and trading activities on Solana. Fees include protocol fees, referral fees, and creator fees.',
    Revenue:
      'All collected fees constitute protocol revenue as Vibes retains 100% of fees.',
    ProtocolRevenue:
      'Protocol revenue equals total fees as there are no token holders to distribute fees to.',
  },
}

export default adapter
