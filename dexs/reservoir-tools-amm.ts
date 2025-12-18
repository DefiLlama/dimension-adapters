// Reservoir Tools AMM (Uniswap V2) - Migrated to event logs
// Reservoir deploys canonical Uniswap V2 contracts across chains
// Docs: https://web.archive.org/web/20250613225922/https://nft.reservoir.tools/docs/reservoir-swap
// Contract Deployments: https://web.archive.org/web/20250613231517/https://nft.reservoir.tools/docs/uniswap-contract-deployments
// GitHub: https://github.com/reservoirprotocol
// See issue: https://github.com/DefiLlama/dimension-adapters/issues/5063

import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { addOneToken } from '../helpers/prices';

const factories: { [chain: string]: string } = {
  [CHAIN.ABSTRACT]: '0x566d7510dEE58360a64C9827257cF6D0Dc43985E',
  [CHAIN.INK]: '0xfe57A6BA1951F69aE2Ed4abe23e0f095DF500C04',
  [CHAIN.ZERO]: '0x1B4427e212475B12e62f0f142b8AfEf3BC18B559',
};

const abis = {
  pairCreated:
    'event PairCreated(address indexed token0, address indexed token1, address pair, uint256)',
  swap: 'event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)',
};

const fetch = async (options: FetchOptions) => {
  const { createBalances, getLogs, chain } = options;
  const dailyVolume = createBalances();
  const dailyFees = createBalances();

  const factory = factories[chain];

  if (!factory) {
    return { dailyVolume, dailyFees };
  }

  // Get all pairs from PairCreated events (from start date)
  const pairCreatedLogs = await getLogs({
    target: factory,
    eventAbi: abis.pairCreated,
    cacheInCloud: true,
  });

  const pairs: { [pair: string]: { token0: string; token1: string } } = {};

  pairCreatedLogs.forEach((log: any) => {
    pairs[log.pair.toLowerCase()] = {
      token0: log.token0,
      token1: log.token1,
    };
  });

  const pairAddresses = Object.keys(pairs);

  if (pairAddresses.length === 0) {
    return { dailyVolume, dailyFees };
  }

  // Get swap events from all pairs for today
  const swapLogs = await getLogs({
    targets: pairAddresses,
    eventAbi: abis.swap,
    flatten: false,
  });

  const fees = 0.003; // 0.3% fee

  swapLogs.forEach((logs: any, index: number) => {
    if (!logs.length) {
      return;
    }

    const pairAddress = pairAddresses[index];
    const { token0, token1 } = pairs[pairAddress];

    logs.forEach((log: any) => {
      addOneToken({
        chain,
        balances: dailyVolume,
        token0,
        token1,
        amount0: log.amount0In,
        amount1: log.amount1In,
      });
      addOneToken({
        chain,
        balances: dailyVolume,
        token0,
        token1,
        amount0: log.amount0Out,
        amount1: log.amount1Out,
      });
      addOneToken({
        chain,
        balances: dailyFees,
        token0,
        token1,
        amount0: Number(log.amount0In) * fees,
        amount1: Number(log.amount1In) * fees,
      });
      addOneToken({
        chain,
        balances: dailyFees,
        token0,
        token1,
        amount0: Number(log.amount0Out) * fees,
        amount1: Number(log.amount1Out) * fees,
      });
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
