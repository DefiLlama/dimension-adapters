import { CHAIN } from "../helpers/chains"
import { uniV3Exports } from "../helpers/uniswap"

const adapter = uniV3Exports({
  [CHAIN.MONAD]: {
    factory: '0x7716F310d62Aee3d009fd94067c627fe7E2f2aA9',
  }
})

export default adapter;
