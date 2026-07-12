import { FetchOptions, FetchResult, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const factory = '0x137841043180bba8ef52828f9030d1b7fe065f95';
const factory_block = 1820393;

const eventAbis = {
  event_poolCreated: 'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)',
  event_swap: 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)'
};

const fetch = async (fetchOptions: FetchOptions): Promise<FetchResult> => {
  const { createBalances, getToBlock, getLogs } = fetchOptions;
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const toBlock = await getToBlock();

  const rawPairs = await getLogs({ target: factory, fromBlock: factory_block, toBlock, eventAbi: eventAbis.event_poolCreated, cacheInCloud: true, });
  const pairs = rawPairs.map(({ token0, token1, fee, tickSpacing, pool }) => ({ token0, token1, pool_fees: fee, tickSpacing, pool }));

  const pairInfoMap: Record<string, any> = {};
  pairs.forEach((p) => {
    pairInfoMap[p.pool] = p;
  });

  const targets = pairs.map(({ pool }) => pool);
  const rawLogs = await getLogs({
    targets,
    eventAbi: eventAbis.event_swap,
    flatten: false,
    onlyArgs: true,
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

  return { dailyVolume, dailyFees };
};

const adapters: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SONEIUM],
  start: '2025-01-13',
};

export default adapters;
