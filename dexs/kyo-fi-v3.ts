import { sliceIntoChunks } from "@defillama/sdk/build/util";
import { FetchOptions, FetchResult, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const factory = '0x137841043180bba8ef52828f9030d1b7fe065f95';
const factory_block = 1820393;

const eventAbis = {
  event_poolCreated: 'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)',
  event_swap: 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)'
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const BLOCK_STEP = 10_000;

const fetch = async (_: any, _1: any, fetchOptions: FetchOptions): Promise<FetchResult> => {
  const { api, createBalances, getFromBlock, getLogs } = fetchOptions;
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const [fromBlock, toBlock] = await Promise.all([getFromBlock(), (await api.getBlock()) - 100]);

  const rawPairs = await getLogs({ target: factory, fromBlock: factory_block, toBlock, eventAbi: eventAbis.event_poolCreated, cacheInCloud: true, });
  const pairs = rawPairs.map(({ token0, token1, fee, tickSpacing, pool }) => ({ token0, token1, pool_fees: fee, tickSpacing, pool }));

  const pairInfoMap: Record<string, any> = {};
  pairs.forEach((p) => {
    pairInfoMap[p.pool] = p;
  });

  const targetChunkSize = 50;
  const pairChunks = sliceIntoChunks(pairs, targetChunkSize);

  for (let i = 0; i < pairChunks.length; i++) {
    const chunk = pairChunks[i];
    const targets = chunk.map(({ pool }) => pool);

    for (let start = fromBlock; start <= toBlock; start += BLOCK_STEP) {
      const end = Math.min(start + BLOCK_STEP - 1, toBlock);
      await sleep(500);

      const rawLogs = await getLogs({
        targets,
        eventAbi: eventAbis.event_swap,
        flatten: false,
        fromBlock: start,
        toBlock: end,
        onlyArgs: true,
        skipCache: true,
        skipCacheRead: true
      });

      rawLogs.forEach((logs: any[], idx: number) => {
        const pool = targets[idx];
        const info = pairInfoMap[pool];
        if (!info) return;

        const { token1, pool_fees } = info;
        logs.forEach(({ amount1 }: any) => {
          const absAmount = amount1 < 0n ? -amount1 : amount1;
          const fee = Math.round((Number(absAmount) * Number(pool_fees)) / 1_000_000);
          dailyVolume.add(token1, absAmount);
          dailyFees.add(token1, fee);
        });
      });
    }
  }

  return { dailyVolume, dailyFees };
};

const adapters: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SONEIUM]: {
      fetch,
      start: '2025-01-13'
    }
  }
};

export default adapters;
