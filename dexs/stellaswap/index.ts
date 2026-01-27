import { CHAIN } from '../../helpers/chains'
import { uniV2Exports } from '../../helpers/uniswap'

export default uniV2Exports({
  [CHAIN.MOONBEAM]: { factory: '0x68A384D826D3678f78BB9FB1533c7E9577dACc0E', fees: 0.0025, revenueRatio: 0.2, protocolRevenueRatio: 0.2},
})