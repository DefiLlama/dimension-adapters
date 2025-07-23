
import { CHAIN } from '../../helpers/chains'
import { uniV3Exports } from '../../helpers/uniswap'

export default uniV3Exports({
  [CHAIN.MODE]: { factory: '0xa0b018Fe0d00ed075fb9b0eEe26d25cf72e1F693', revenueRatio: 1/3, protocolRevenueRatio: 1/3, swapEvent: 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint128 protocolFeesToken0, uint128 protocolFeesToken1)'  },
})