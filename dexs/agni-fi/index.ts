
import { CHAIN } from "../../helpers/chains";
import { uniV3Exports } from "../../helpers/uniswap";

export default uniV3Exports({
  [CHAIN.MANTLE]: {
    factory: '0x25780dc8Fc3cfBD75F33bFDAB65e969b603b2035',
    swapEvent: 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint128 protocolFeesToken0, uint128 protocolFeesToken1)'
  }
})
