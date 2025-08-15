import { CHAIN } from "../../helpers/chains"
import { uniV2Exports } from "../../helpers/uniswap"

export default uniV2Exports({
  [CHAIN.POLYGON]: {
    factory: '0xBE087BeD88539d28664c9998FE3f180ea7b9749C',
    userFeesRatio: 1,
    revenueRatio: 0,
  }
})