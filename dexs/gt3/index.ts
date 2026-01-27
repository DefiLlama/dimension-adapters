import { CHAIN } from '../../helpers/chains'
import { uniV2Exports } from '../../helpers/uniswap'

export default uniV2Exports({
  [CHAIN.POLYGON]: { factory: '0x2d7360Db7216792cfc2c73B79C0cA629007E2af4', start: '2025-04-23', },
})