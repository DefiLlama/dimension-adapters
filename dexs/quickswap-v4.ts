import { CHAIN } from "../helpers/chains";
import { uniV3Exports } from "../helpers/uniswap";

const algebraV3PoolCreatedEvent = 'event Pool (address indexed token0, address indexed token1, address pool)'
const algebraV3SwapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 price, uint128 liquidity, int24 tick, uint24 overrideFee, uint24 pluginFee)'

export default uniV3Exports({
  [CHAIN.BASE]: {
    factory: "0xC5396866754799B9720125B104AE01d935Ab9C7b",
    poolCreatedEvent: algebraV3PoolCreatedEvent,
    swapEvent: algebraV3SwapEvent,
    isAlgebraV3: true,
    start: '2025-08-12',
  },
})
