import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
import { getUniV3LogAdapter } from "../../helpers/uniswap";

const swapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint128 protocolFeesToken0, uint128 protocolFeesToken1)'

const adapter: SimpleAdapter = {
  version: 2,
  fetch: getUniV3LogAdapter({ factory: '0x559Fa53Be355835a038aC303A750E8788668636B', swapEvent }),
  chains: [CHAIN.LINEA],
  start: '2023-04-09',
}

export default adapter;