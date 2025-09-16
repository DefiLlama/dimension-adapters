import { CHAIN } from '../../helpers/chains'
import { uniV2Exports } from '../../helpers/uniswap'

export default uniV2Exports({
  [CHAIN.XDC]: { 
    factory: '0x347D14b13a68457186b2450bb2a6c2Fd7B38352f', 
    userFeesRatio: 1,
    revenueRatio: 0,
  },
})