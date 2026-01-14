import { CHAIN } from "../../helpers/chains";
import { uniV3Exports } from "../../helpers/uniswap";

export default uniV3Exports({
  [CHAIN.BSC]: {
    factory: "0x10d8612D9D8269e322AB551C18a307cB4D6BC07B",
    userFeesRatio: 1,
    revenueRatio: 0.1,
    protocolRevenueRatio: 0.1,
    swapEvent: 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint128 protocolFeesToken0, uint128 protocolFeesToken1)'
  },
});
