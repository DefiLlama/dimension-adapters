import { CHAIN } from "../helpers/chains"
import { uniV3Exports } from "../helpers/uniswap"

const adapter = uniV3Exports({
  [CHAIN.MONAD]: {
    factory: '0x05aA1d36F78D1242C40b3680d38EB1feE7060c20',
    poolCreatedEvent: 'event Pool (address indexed token0, address indexed token1, address pool)',
    swapEvent: 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 price, uint128 liquidity, int24 tick, uint24 overrideFee, uint24 pluginFee)',
    isAlgebraV3: true,
  }
})

export default adapter;
