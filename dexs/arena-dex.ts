import { CHAIN } from '../helpers/chains'
import { uniV2Exports } from '../helpers/uniswap'

export default uniV2Exports({
  [CHAIN.AVAX]: { factory: '0xF16784dcAf838a3e16bEF7711a62D12413c39BD1', fees: 0, start: '2025-04-23'},
})