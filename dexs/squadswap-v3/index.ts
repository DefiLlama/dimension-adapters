import { CHAIN } from "../../helpers/chains"
import { uniV3Exports } from "../../helpers/uniswap"

export default uniV3Exports({
  [CHAIN.BSC]: {
    factory: '0x009c4ef7C0e0Dd6bd1ea28417c01Ea16341367c3',
    userFeesRatio: 1,
    revenueRatio: 0.1,
    protocolRevenueRatio: 0.1,
  }
})