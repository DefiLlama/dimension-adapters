import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
import { getUniV3LogAdapter } from "../../helpers/uniswap";

const poolCreatedEvent = 'event Pool (address indexed token0, address indexed token1, address pool)'
const swapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 price, uint128 liquidity, int24 tick)'

const config = {
  isAlgebraV3: true,
  swapEvent,
  poolCreatedEvent,
  userFeesRatio: 1,
  revenueRatio: 0.455,
  protocolRevenueRatio: 0.13,
  holdersRevenueRatio: 0.325,
}

// https://docs.swapsicle.io/guide/Tokenomics.html#fee-distribution
const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: 'Users pay 0.25% per swap.',
    UserFees: 'Users pay 0.25% per swap.',
    Revenue: 'Protocol collects 32% swap fees for protocol treasury and tokens buy back.',
    ProtocolRevenue: 'Protocol collects 12% swap fees for protocol treasury.',
    HoldersRevenue: 'Protocol collects 20% swap fees for token buy back.',
    SupplySideRevenue: 'Protocol distributes 68% swap fees to LPs.',
  },
  adapter: {
    [CHAIN.MANTLE]: { fetch: getUniV3LogAdapter({ factory: '0xC848bc597903B4200b9427a3d7F61e3FF0553913', ...config }), start: 1697155200 },
    [CHAIN.TELOS]: { fetch: getUniV3LogAdapter({ factory: '0xA09BAbf9A48003ae9b9333966a8Bda94d820D0d9', ...config }), start: 1698105600 },
    [CHAIN.TAIKO]: { fetch: getUniV3LogAdapter({ factory: '0xBa90FC740a95A6997306255853959Bb284cb748a', ...config }), start: 1724943360 },
  },
}

export default adapter;
