import { CHAIN } from '../../helpers/chains'
import { uniV2Exports } from '../../helpers/uniswap'

export default {
  ...uniV2Exports({
    [CHAIN.VANA]: { 
      factory: '0xc2a0d530e57B1275fbce908031DA636f95EA1E38', 
      fees: 0.003, // 0.3% fee on swaps
    },
  }),
}