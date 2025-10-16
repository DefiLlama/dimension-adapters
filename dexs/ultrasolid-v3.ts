// https://ultrasolid.notion.site/fluvi/Fee-Split-Structure-26ba25711cfa80e9b103f0845d6d175f
// ## Private Launching Phase

// - **100%** distributed to Liquidity Providers (LPs)

// ## Pre-TGE Phase

// - **87%** distributed to Liquidity Providers (LPs)
// - **13%** allocated for initial costs and essential liquidity provision (Not yet applied)

// ## Post-TGE Phase

// - Following ve-tokenomics model:
//     - **100% of fees distributed to $veUS voters**
//     - Liquidity Providers receive $US token emissions
// - For Unstaked LPs:
//     - **14%** of fees redirected to **voter** gauge to incentivize staking participation

import { CHAIN } from "../helpers/chains";
import { uniV3Exports } from "../helpers/uniswap";

export default uniV3Exports({
  [CHAIN.HYPERLIQUID]: {
    factory: '0xD883a0B7889475d362CEA8fDf588266a3da554A1',
    swapEvent: 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)',
    poolCreatedEvent: 'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)',
    start: '2025-08-10',
    revenueRatio: 0,
    protocolRevenueRatio: 0,
    holdersRevenueRatio: 0,
    userFeesRatio: 1,
  }
})
