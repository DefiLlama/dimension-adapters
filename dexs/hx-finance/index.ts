import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV3LogAdapter } from "../../helpers/uniswap";

// https://docs.hx.finance/technical/fee-mechanics#fee-distribution
const config = {
  poolCreatedEvent: 'event Pool (address indexed token0, address indexed token1, address pool)',
  swapEvent: 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 price, uint128 liquidity, int24 tick)',
  isAlgebraV3: true,
  userFeesRatio: 1,
  revenueRatio: 0.13, // 13%
  protocolRevenueRatio: 0.13, // 13%
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Volume: "Total trading volume on HX Finance DEX",
    Fees: "Trading fees collected from swap transactions",
    UserFees: "Trading fees collected from swap transactions",
    Revenue: "Protocol revenue from trading fees (13% or pool-specific community fee)",
    ProtocolRevenue: "Protocol revenue from trading fees (13% or pool-specific community fee)",
    SupplySideRevenue: "Fees distributed to liquidity providers (87% or remainder after protocol fee)",
  },
  fetch: getUniV3LogAdapter({ factory: '0x41ba59415eC75AC4242dd157F2a7A282F1e75652', ...config }),
  chains: [CHAIN.HYPERLIQUID],
  start: "2025-08-01",
};

export default adapter;