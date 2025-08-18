import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
import { getUniV3LogAdapter } from "../../helpers/uniswap";

const poolCreatedEvent = 'event Pool (address indexed token0, address indexed token1, address pool)'
const swapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 price, uint128 liquidity, int24 tick)'

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: 'Users pay fees per swap.',
    UserFees: 'Users pay 0.1% per swap.',
    Revenue: 'Protocol collects 10% swap fees.',
    ProtocolRevenue: 'Protocol collects 10% swap fees.',
    SupplySideRevenue: '90% swap fees distributes to LPs.',
  },
  fetch: getUniV3LogAdapter({ factory: '0x7a44CD060afC1B6F4c80A2B9b37f4473E74E25Df', isAlgebraV3: true, poolCreatedEvent, swapEvent, userFeesRatio: 1, revenueRatio: 0.1, protocolRevenueRatio: 0.1 }),
  chains: [CHAIN.BLAST],
}

export default adapter;
