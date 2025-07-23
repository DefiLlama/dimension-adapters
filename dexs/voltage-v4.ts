import { CHAIN } from "../helpers/chains";
import { uniV3Exports } from "../helpers/uniswap";

const algebraV3PoolCreatedEvent = 'event Pool (address indexed token0, address indexed token1, address pool)'
const algebraV3SwapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 price, uint128 liquidity, int24 tick, uint24 overrideFee, uint24 pluginFee)'

export default uniV3Exports({
  [CHAIN.FUSE]: {
    factory: "0xccEdb990abBf0606Cf47e7C6A26e419931c7dc1F",
    poolCreatedEvent: algebraV3PoolCreatedEvent,
    swapEvent: algebraV3SwapEvent,
    isAlgebraV3: true,
  },
})
