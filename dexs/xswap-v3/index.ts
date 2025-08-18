import { CHAIN } from "../../helpers/chains"
import { uniV3Exports } from "../../helpers/uniswap"

export default uniV3Exports({
  [CHAIN.XDC]: {
    factory: '0x30F317A9EC0f0D06d5de0f8D248Ec3506b7E4a8A',
    userFeesRatio: 1,
    revenueRatio: 0,
  }
})