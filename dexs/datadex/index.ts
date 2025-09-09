import { CHAIN } from '../../helpers/chains'
import { uniV3Exports } from '../../helpers/uniswap'

export default {
  ...uniV3Exports({
    [CHAIN.VANA]: { factory: '0xc2a0d530e57B1275fbce908031DA636f95EA1E38' },
  }),
}