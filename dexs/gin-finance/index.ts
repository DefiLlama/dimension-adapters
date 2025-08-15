import { CHAIN } from "../../helpers/chains"
import { uniV2Exports } from "../../helpers/uniswap"

export default uniV2Exports({
  [CHAIN.BOBA]: {
    factory: '0x06350499760aa3ea20FEd2837321a84a92417f39',
    userFeesRatio: 1,
    revenueRatio: 0,
  }
})