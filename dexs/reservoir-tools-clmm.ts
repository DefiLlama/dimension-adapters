// Reservoir Tools CLMM (Uniswap V3) - Migrated to event logs
// Reservoir deploys canonical Uniswap V3 contracts across chains
// Docs: https://web.archive.org/web/20250613225922/https://nft.reservoir.tools/docs/reservoir-swap
// Contract Deployments: https://web.archive.org/web/20250613231517/https://nft.reservoir.tools/docs/uniswap-contract-deployments
// GitHub: https://github.com/reservoirprotocol
// See issue: https://github.com/DefiLlama/dimension-adapters/issues/5064

import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';

const factories: { [chain: string]: string } = {
  [CHAIN.ABSTRACT]: '0xA1160e73B63F322ae88cC2d8E700833e71D0b2a1',
  [CHAIN.INK]: '0x640887A9ba3A9C53Ed27D0F7e8246A4F933f3424',
  [CHAIN.ZERO]: '0xA1160e73B63F322ae88cC2d8E700833e71D0b2a1',
};

const abis = {
  poolCreated:
    'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)',
  swap: 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)',
};

const fetch = async (options: FetchOptions) => {
  const { createBalances, getLogs, chain } = options;
  const dailyVolume = createBalances();
  const dailyFees = createBalances();

  const factory = factories[chain];

  if (!factory) {
    return { dailyVolume, dailyFees };
  }

  // Get all pools from PoolCreated events
  const poolCreatedLogs = await getLogs({
    target: factory,
    eventAbi: abis.poolCreated,
    cacheInCloud: true,
  });

  const pools: {
    [pool: string]: { token0: string; token1: string; fee: number };
  } = {};

  poolCreatedLogs.forEach((log: any) => {
    pools[log.pool.toLowerCase()] = {
      token0: log.token0,
      token1: log.token1,
      fee: Number(log.fee) / 1000000, // Convert from basis points to decimal (e.g., 3000 -> 0.003)
    };
  });

  const poolAddresses = Object.keys(pools);

  if (poolAddresses.length === 0) {
    return { dailyVolume, dailyFees };
  }

  // Get swap events from all pools for today
  const swapLogs = await getLogs({
    targets: poolAddresses,
    eventAbi: abis.swap,
    flatten: false,
  });

  swapLogs.forEach((logs: any, index: number) => {
    if (!logs.length) {
      return;
    }

    const poolAddress = poolAddresses[index];
    const { token0, token1, fee } = pools[poolAddress];

    logs.forEach((log: any) => {
      // V3 uses signed integers, take absolute values for volume
      const amount0 = Math.abs(Number(log.amount0));
      const amount1 = Math.abs(Number(log.amount1));

      // Add volume
      dailyVolume.add(token0, amount0);
      dailyVolume.add(token1, amount1);

      // Add fees (fee is already in decimal form)
      dailyFees.add(token0, amount0 * fee);
      dailyFees.add(token1, amount1 * fee);
    });
  });

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees.clone(0), // 0% protocol revenue
    dailySupplySideRevenue: dailyFees, // 100% to LPs
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ABSTRACT]: {
      fetch,
      start: '2025-01-07',
    },
    [CHAIN.INK]: {
      fetch,
      start: '2025-01-07',
    },
    [CHAIN.ZERO]: {
      fetch,
      start: '2025-01-07',
    },
  },
};

export default adapter;
