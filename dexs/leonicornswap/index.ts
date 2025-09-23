import { CHAIN } from '../../helpers/chains'
import { uniV2Exports } from '../../helpers/uniswap'

export default uniV2Exports({
  [CHAIN.BSC]: { 
    factory: '0xEB10f4Fe2A57383215646b4aC0Da70F8EDc69D4F', 
    fees: 0.003, // 0.3% fee on swaps
  },
})