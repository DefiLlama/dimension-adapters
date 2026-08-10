import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { addOneToken } from "../../helpers/prices";

// Shared across every Metric factory version (see dexs/metric-v1). Each version
// lives in its own adapter folder but only differs by the factory address and
// its per-chain deployment blocks — the pool discovery + volume accounting is
// identical, so it is built here once.
export type MetricChainConfig = Record<string, { fromBlock: number; start: string }>;

// Event ABIs differ between factory versions (see dexs/metric-v1), so they are
// injected per adapter. `poolField` is the PoolCreated field holding the pool
// address (legacy: `pool`, v1: `poolAddress`).
export type MetricEvents = { swapEvent: string; poolCreatedEvent: string; poolField: string };

const LEGACY_EVENTS: MetricEvents = {
  swapEvent:
    "event Swap(address sender, address recipient, bool exactInput, int128 amount0Delta, int128 amount1Delta, int16 newTick, uint104 newPositionInBin)",
  poolCreatedEvent:
    "event PoolCreated(address indexed token0,address indexed token1,address indexed priceProvider,address pool,bytes32 poolId)",
  poolField: "pool",
};

const methodology = {
  Volume:
    "Sum of all input token amounts from Swap events across every pool created by Metric. Pools are discovered on-chain from factory contract's PoolCreated event.",
};

export const getMetricAdapter = (factory: string, chainConfig: MetricChainConfig, events: MetricEvents = LEGACY_EVENTS): SimpleAdapter => {
  const fetch = async (options: FetchOptions) => {
    const dailyVolume = options.createBalances();

    const fromBlock = chainConfig[options.chain].fromBlock;

    const poolCreatedLogs = await options.getLogs({
      target: factory,
      eventAbi: events.poolCreatedEvent,
      fromBlock,
      cacheInCloud: true,
    });

    const tokensByPool: Map<string, { token0: string, token1: string }> = new Map(poolCreatedLogs.map(log => [log[events.poolField].toLowerCase(), { token0: log.token0.toLowerCase(), token1: log.token1.toLowerCase() }]));
    const poolAddresses = poolCreatedLogs.map(log => log[events.poolField].toLowerCase());
    if (!poolAddresses.length) return { dailyVolume };

    const swapLogs = await options.getLogs({
      targets: poolAddresses,
      eventAbi: events.swapEvent,
      flatten: false,
    });

    swapLogs.forEach((logs: any[], index: number) => {
      if (!logs.length) return;
      const poolDetails = tokensByPool.get(poolAddresses[index]);
      if (!poolDetails) return;
      const { token0, token1 } = poolDetails;
      for (const log of logs) {
        const amount0 = BigInt(log.amount0Delta);
        const amount1 = BigInt(log.amount1Delta);
        addOneToken({ balances: dailyVolume, token0, amount0, token1, amount1 });
      }
    });

    return { dailyVolume };
  };

  return {
    version: 2,
    fetch,
    pullHourly: true,
    adapter: chainConfig,
    methodology,
  };
};
