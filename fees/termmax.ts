import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { addTokensReceived } from '../helpers/token'

/**
 * TermMax Fee Adapter
 *
 * Tracks protocol revenue by monitoring tokens received by treasury.
 * Fee sources: Swap fees (taker portion), GT minting fees, vault performance fees.
 */

const TREASURY = '0x719e77027952929ed3060dbFFC5D43EC50c1cf79'

const fetch = async (options: FetchOptions) => {
  const dailyFees = await addTokensReceived({
    options,
    target: TREASURY,
  })

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: '2025-03-27' },
    [CHAIN.ARBITRUM]: { fetch, start: '2025-03-27' },
    [CHAIN.BSC]: { fetch, start: '2025-05-28' },
  },
  methodology: {
    Fees: 'Protocol fees collected by TermMax treasury from swap fees, GT minting fees, and vault performance fees.',
    Revenue: 'All fees received by the TermMax treasury.',
    ProtocolRevenue: 'Same as Revenue - all fees go to protocol treasury.',
  },
}

export default adapter
