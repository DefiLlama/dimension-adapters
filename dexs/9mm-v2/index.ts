import { CHAIN } from '../../helpers/chains'
import { uniV2Exports } from '../../helpers/uniswap'

export default uniV2Exports({
  [CHAIN.PULSECHAIN]: { factory: '0x3a0Fa7884dD93f3cd234bBE2A0958Ef04b05E13b', fees: 0.0025, revenueRatio: 0.08 / 0.25, protocolRevenueRatio: 0.08 / 0.25 },
  [CHAIN.BASE]: { factory: '0x4c1b8D4ae77A37b94e195CAB316391d3C687ebd1', fees: 0.0025, revenueRatio: 0.08 / 0.25, protocolRevenueRatio: 0.08 / 0.25 },
  [CHAIN.SONIC]: { factory: '0x0f7B3FcBa276A65dd6E41E400055dcb75BA66750', fees: 0.0025, revenueRatio: 0.08 / 0.25, protocolRevenueRatio: 0.08 / 0.25 },
})