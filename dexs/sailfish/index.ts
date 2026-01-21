import { SimpleAdapter } from "../../adapters/types";
import { getUniV3LogAdapter } from '../../helpers/uniswap'

const swapEvent = "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 price, uint128 liquidity, int24 tick)"
const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Volume: 'Total swap volume',
    Fees: 'Swap fees paid by users.',
    UserFees: 'Swap fees paid by users.',
    Revenue: 'No revenue.',
    SupplySideRevenue: 'All the swap fees are distributed to LPs',
  },
  start: '2025-1-17',
  chains: ["occ"],
  fetch: getUniV3LogAdapter({ factory: '0x963A7f4eB46967A9fd3dFbabD354fC294FA2BF5C', userFeesRatio: 1, revenueRatio: 0, swapEvent: swapEvent }),
}

export default adapter
