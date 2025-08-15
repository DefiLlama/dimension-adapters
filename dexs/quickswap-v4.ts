import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV3LogAdapter } from "../helpers/uniswap";

const poolCreatedEvent = 'event Pool (address indexed token0, address indexed token1, address pool)'
const swapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 price, uint128 liquidity, int24 tick, uint24 overrideFee, uint24 pluginFee)'

const config = {
  isAlgebraV3: true,
  poolCreatedEvent,
  swapEvent,
  userFeesRatio: 1,
  revenueRatio: 0, // 100% fees to LPs
  protocolRevenueRatio: 0, // 100% fees to LPs
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch: getUniV3LogAdapter({ factory: '0xC5396866754799B9720125B104AE01d935Ab9C7b', ...config }),
      start: '2025-08-12',
    },
  }
}

export default adapter;
