import { CHAIN } from '../../helpers/chains'
import { uniV2Exports } from '../../helpers/uniswap'

export default uniV2Exports({
  [CHAIN.LINEA]: { factory: '0xbc7695fd00e3b32d08124b7a4287493aee99f9ee', start: "2024-02-11", fees: 0.0025, stableFees: 0.0001, userFeesRatio: 1, revenueRatio: 1, protocolRevenueRatio: 0, holdersRevenueRatio: 1 },
})