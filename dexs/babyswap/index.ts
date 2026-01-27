import { CHAIN } from "../../helpers/chains"
import { uniV2Exports } from "../../helpers/uniswap"

export default uniV2Exports({
  [CHAIN.BSC]: {
    factory: '0x86407bEa2078ea5f5EB5A52B2caA963bC1F889Da',
    userFeesRatio: 1,
    revenueRatio: 0,
  }
})