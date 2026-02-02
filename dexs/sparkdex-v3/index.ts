
import { SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { getUniV3LogAdapter } from '../../helpers/uniswap'


const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Volume: 'Total swap volume',
    Fees: 'Swap fees paid by users.',
    UserFees: 'Swap fees paid by users.',
    Revenue: '7.5% of the fees go to the protocol.',
    ProtocolRevenue: '2.5% of the fees go to the SparkDEX Foundation',
    HoldersRevenue: '5% of the fees are used in buybacks and burns of $SPRK',
    SupplySideRevenue: '87.5% of swap fees are distributed to LPs and 5% is distributed to $SPRK stakers',
  },
  start: '2024-06-27',
  chains: [CHAIN.FLARE],
  fetch: getUniV3LogAdapter({ factory: '0xb3fB4f96175f6f9D716c17744e5A6d4BA9da8176', userFeesRatio: 1, revenueRatio: 0.075, protocolRevenueRatio: 0.025, holdersRevenueRatio: 0.05 }),
}

export default adapter