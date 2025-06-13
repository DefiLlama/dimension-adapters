import { CHAIN } from '../../helpers/chains'
import { uniV2Exports } from '../../helpers/uniswap'

export default uniV2Exports({
  [CHAIN.MOONRIVER]: { factory: '0x049581aEB6Fe262727f290165C29BDAB065a1B68', start: '2021-09-06', fees: 0.0025, revenueRatio: 0.2, protocolRevenueRatio: 0.2, holdersRevenueRatio: 0,},
})