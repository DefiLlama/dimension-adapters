import { CHAIN } from '../helpers/chains'
import { uniV2Exports } from '../helpers/uniswap'

const FACTORY = '0xb7E5848e1d0CB457f2026670fCb9BbdB7e9E039C'

const adapter = uniV2Exports({
  [CHAIN.BSC]: {
    factory: FACTORY,
    fees: 0.003,
    revenueRatio: 0,
    protocolRevenueRatio: 0,
    userFeesRatio: 1,
    start: '2022-08-10',
  },
})

export default {
  ...adapter,
  methodology: {
    Volume: 'Swap volume from MelegaSwap V2 liquidity pairs on BNB Smart Chain.',
    Fees: 'A 0.3% fee is charged on each swap.',
    UserFees: 'Users pay the 0.3% swap fee.',
    Revenue: 'The factory fee recipient is disabled, so the protocol receives no swap-fee revenue.',
    ProtocolRevenue: 'The factory fee recipient is disabled, so protocol revenue is zero.',
    SupplySideRevenue: 'Swap fees accrue to liquidity providers.',
  },
  breakdownMethodology: {
    Fees: {
      'Token Swap Fees': 'The 0.3% fee charged on each token swap.',
    },
    UserFees: {
      'Trading fees': 'The full 0.3% swap fee paid by users.',
    },
    Revenue: {
      'Protocol fees': 'Protocol-retained swap fees; zero while the factory fee recipient is disabled.',
    },
    ProtocolRevenue: {
      'Protocol fees': 'Protocol-retained swap fees; zero while the factory fee recipient is disabled.',
    },
    SupplySideRevenue: {
      'LP fees': 'Swap fees accruing to liquidity providers.',
    },
  },
}
