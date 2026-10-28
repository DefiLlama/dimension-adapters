import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV3LogAdapter, UniGetRevenueRatioProps } from "../helpers/uniswap";

const methodology = {
  UserFees: "User pays fees on each swap based pool tier: 0.01%, 0.05%, 0.1%, 0.20%, 0.50%, and 1%.",
  ProtocolRevenue: "Treasury receives 20% of fees each swap.",
  SupplySideRevenue: "LPs receive 80% of the fees.",
  // HoldersRevenue: "", // no governance token yet
  Revenue: "Treasury receives 20% of fees each swap.",
  Fees: "User pays fees on each swap based pool tier: 0.01%, 0.05%, 0.1%, 0.20%, 0.50%, and 1%."
};

const ABIS = {
  POOL_CREATE: 'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)',
  SWAP_EVENT: 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint128 protocolFeesToken0, uint128 protocolFeesToken1)'
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  adapter: {
    [CHAIN.KLAYTN]: {
      fetch: getUniV3LogAdapter({
        factory: '0x7431A23897ecA6913D5c81666345D39F27d946A4',
        poolCreatedEvent: ABIS.POOL_CREATE,
        swapEvent: ABIS.SWAP_EVENT,
        getRevenueRatio: (_props: UniGetRevenueRatioProps): { _revenueRatio: number, _protocolRevenueRatio?: number, _holdersRevenueRatio?: number } => {
          // https://docs.dgswap.io/products/fees
          return { _revenueRatio: 0.2, _protocolRevenueRatio: 0.2 } // same 20% for all pools
        }
      }),
    },
  },
};

export default adapter;
