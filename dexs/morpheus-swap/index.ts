import { CHAIN } from '../../helpers/chains'
import { uniV2Exports } from '../../helpers/uniswap'

export default uniV2Exports({
  [CHAIN.FANTOM]: { 
    factory: '0x9C454510848906FDDc846607E4baa27Ca999FBB6', 
    fees: 0.003, // 0.3% fee on swaps
  },
})