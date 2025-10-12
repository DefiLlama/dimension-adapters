import { CHAIN } from '../../helpers/chains'
import { uniV2Exports } from '../../helpers/uniswap'

export default uniV2Exports({
  [CHAIN.ARBITRUM]: { 
    factory: '0xfe3699303D3Eb460638e8aDA2bf1cFf092C33F22', 
    fees: 0.003, // 0.3% fee on swaps
  },
})