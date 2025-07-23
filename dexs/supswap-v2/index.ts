import { CHAIN } from '../../helpers/chains'
import { uniV2Exports } from '../../helpers/uniswap'

export default uniV2Exports({
  [CHAIN.MODE]: { factory: '0x557f46F67a36E16Ff27e0a39C5DA6bFCB4Ff89c0', start: '2024-01-27', fees: 0.002, revenueRatio: 0.25, },
})