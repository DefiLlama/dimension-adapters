import { FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV3LogAdapter } from "../helpers/uniswap";

const QuickswapV3Factories: Record<string, string> = {
  [CHAIN.POLYGON]: '0x411b0fAcC3489691f28ad58c47006AF5E3Ab3A28',
  [CHAIN.MANTA]: '0x56c2162254b0E4417288786eE402c2B41d4e181e',
  [CHAIN.IMX]: '0x56c2162254b0E4417288786eE402c2B41d4e181e',
  [CHAIN.POLYGON_ZKEVM]: '0x4B9f4d2435Ef65559567e5DbFC1BbB37abC43B57',
  [CHAIN.SONEIUM]: '0x8Ff309F68F6Caf77a78E9C20d2Af7Ed4bE2D7093',
}

async function getFetchUniV3LogAdapter(options: FetchOptions) {
  const adapter = getUniV3LogAdapter({
    factory: QuickswapV3Factories[options.chain],
    poolCreatedEvent: 'event Pool (address indexed token0, address indexed token1, address pool)',
    swapEvent: 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 price, uint128 liquidity, int24 tick)',
    isAlgebraV2: true,
    userFeesRatio: 1,
    revenueRatio: 0,
    protocolRevenueRatio: 0,
    holdersRevenueRatio: 0,
  });

  return await adapter(options);
}

export default {
  version: 2,
  pullHourly: true,
  methodology: {
    UserFees: "User pays dynamic fees on each swap based on pool settings (typically 0.01% to 1%).",
    Fees: "Dynamic fees are collected on each swap based on pool configuration",
    Revenue: "Protocol takes 15% of collected fees (current). Historical: 10% before March 2025, 10% on uni forks like IMX.",
    ProtocolRevenue: "Foundation receives 3.23% of collected fees (current). Historical: 1.7% before March 2025, 3% on uni forks.",
    SupplySideRevenue: "85% of collected fees go to liquidity providers (90% on uni forks like IMX).",
    HoldersRevenue: "Community receives 10% of collected fees for buybacks (current). Historical: 6.8% before March 2025, 7% on uni forks.",
  },
  fetch: getFetchUniV3LogAdapter,
  adapter: {
    [CHAIN.POLYGON]: {
      start: '2022-09-06',
    },
    [CHAIN.POLYGON_ZKEVM]: {
      start: '2023-03-27',
    },
    [CHAIN.MANTA]: {
      start: '2023-10-19',
    },
    [CHAIN.IMX]: {
      start: '2023-12-19',
    },
    [CHAIN.SONEIUM]: {
      start: '2025-01-10',
    },
  },
}