import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV3LogAdapter, UniGetRevenueRatioProps } from '../../helpers/uniswap';

const factory = '0x1f0b70d9a137e3caef0ceacd312bc5f81da0cc0c'
const poolCreatedEvent = 'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)'
const poolSwapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)'

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.RONIN]: {
      fetch: getUniV3LogAdapter({
        factory: factory,
        poolCreatedEvent: poolCreatedEvent,
        swapEvent: poolSwapEvent,
        
        // Source: https://docs.roninchain.com/apps/katana/swap-tokens
        getRevenueRatio: (props: UniGetRevenueRatioProps): { _revenueRatio: number, _protocolRevenueRatio?: number, _holdersRevenueRatio?: number } => {
          if (props.poolFeeTier === 0.0001) return { _revenueRatio: 0.5, _protocolRevenueRatio: 0.5 }; // 20% of fees
          if (props.poolFeeTier === 0.003) return { _revenueRatio: 0.0005 / 0.003, _protocolRevenueRatio: 0.0005 / 0.003 }; // ~ 16.6% of fees
          if (props.poolFeeTier === 0.01) return { _revenueRatio: 0.15, _protocolRevenueRatio: 0.15 } // 15% of fee
          return { _revenueRatio: 0, _protocolRevenueRatio: 0 }
        }
      }),
      start: "2024-11-26",
    }
  },
  methodology: {
    Fees: "Total trading fees - sum of LP fees and protocol fees. LP fees vary by pool type (0.25% for most pools, with some special pools having different rates). Protocol fees are 0.05% for most pools.",
    Revenue: "Protocol fees collected by Katana - 0.05% of each trade for most pools",
    ProtocolRevenue: "Protocol fees collected by Katana - 0.05% of each trade for most pools",
    SupplySideRevenue: "Fees distributed to LPs - 0.25% of each trade for most pools",
    UserFees: "Same as Fees - total trading fees paid by users"
  },
};

export default adapter;
