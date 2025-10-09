import { CHAIN } from "../../helpers/chains"
import { uniV2Exports } from "../../helpers/uniswap"

export default uniV2Exports({
  [CHAIN.BSC]: {
    factory: '0x1D9F43a6195054313ac1aE423B1f810f593b6ac1',
    userFeesRatio: 1,
    revenueRatio: 0.1,
    protocolRevenueRatio: 0.1,
  }
})