import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV3LogAdapter } from "../../helpers/uniswap";

// https://gliquids-organization.gitbook.io/gliquid/about-us/fee-structure
const factoryConfig = {
  isAlgebraV3: true,
  poolCreatedEvent: 'event Pool (address indexed token0, address indexed token1, address pool)',
  swapEvent: 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 price, uint128 liquidity, int24 tick, uint24 overrideFee, uint24 pluginFee)',
  userFeesRatio: 1,
  revenueRatio: 0.13,
  protocolRevenue: 0.1,
  holdersRevenueRatio: 0,
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Volume: "Total users swap volume.",
    Fees: "Swap fees paid by users.",
    UserFees: "Swap fees paid by users.",
    Revenue: "13% swap fees distributed to Gliquid and Algebra team.",
    ProtocolRevenue: "Gliquid team collects 10% swap fees.",
    SupplySideRevenue: "87% swap fees distributed to LPs",
    HoldersRevenue: "No revenue for token holders.",
  },
  fetch: getUniV3LogAdapter({ factory: '0x10253594A832f967994b44f33411940533302ACb', ...factoryConfig }),
  chains: [CHAIN.HYPERLIQUID],
  start: '2025-02-06',
};

export default adapter;
