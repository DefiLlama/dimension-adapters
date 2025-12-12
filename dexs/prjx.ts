import { CHAIN } from "../helpers/chains";
import { uniV3Exports } from "../helpers/uniswap";

export default uniV3Exports({
  [CHAIN.HYPERLIQUID]: {
    factory: '0xff7b3e8c00e57ea31477c32a5b52a58eea47b072',
    revenueRatio: 0.143,
    protocolRevenueRatio: 0.143
  },
})
