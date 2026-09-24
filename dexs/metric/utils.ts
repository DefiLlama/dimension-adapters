import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { addOneToken } from "../../helpers/prices";

// Shared across every Metric factory version (see dexs/metric-v1). Each version
// lives in its own adapter folder and only differs by its factories (address,
// deployment block, event layout) — pool discovery + volume accounting is
// identical, so it is built here once.

// Event ABIs differ between pool generations, so they are injected per factory.
// `poolField` is the PoolCreated field holding the pool address (legacy: `pool`,
// v1: `poolAddress`); `swapAmounts` extracts the two token deltas from a decoded
// Swap log, whose layout also differs per generation.
export type MetricEvents = {
  swapEvent: string;
  poolCreatedEvent: string;
  poolField: string;
  swapAmounts: (log: any) => { amount0: bigint; amount1: bigint };
};

export type MetricFactory = {
  address: string;
  // Factory deployment block: lower bound for the PoolCreated scan.
  fromBlock: number;
  // Retired factory: its pools are only counted for periods that start before
  // this UTC date (YYYY-MM-DD), so history stays intact while new days ignore it.
  end?: string;
  events?: MetricEvents;
};

export type MetricFactoriesChainConfig = Record<string, { start: string; factories: MetricFactory[] }>;

// Single-factory shape used by dexs/metric: one factory per chain, deployed at `fromBlock`.
export type MetricChainConfig = Record<string, { fromBlock: number; start: string }>;

const LEGACY_EVENTS: MetricEvents = {
  swapEvent:
    "event Swap(address sender, address recipient, bool exactInput, int128 amount0Delta, int128 amount1Delta, int16 newTick, uint104 newPositionInBin)",
  poolCreatedEvent:
    "event PoolCreated(address indexed token0,address indexed token1,address indexed priceProvider,address pool,bytes32 poolId)",
  poolField: "pool",
  swapAmounts: (log) => ({ amount0: BigInt(log.amount0Delta), amount1: BigInt(log.amount1Delta) }),
};

const methodology = {
  Volume:
    "Sum of all input token amounts from Swap events across every pool created by Metric. Pools are discovered on-chain from factory contract's PoolCreated event.",
};

const dateToTimestamp = (date: string) => Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000);

export const getMetricFactoriesAdapter = (chainConfig: MetricFactoriesChainConfig): SimpleAdapter => {
  const fetch = async (options: FetchOptions) => {
    const dailyVolume = options.createBalances();

    const factories = chainConfig[options.chain].factories.filter(
      (factory) => !factory.end || options.fromTimestamp < dateToTimestamp(factory.end),
    );

    for (const factory of factories) {
      const events = factory.events ?? LEGACY_EVENTS;

      const poolCreatedLogs = await options.getLogs({
        target: factory.address,
        eventAbi: events.poolCreatedEvent,
        fromBlock: factory.fromBlock,
        cacheInCloud: true,
      });

      const pools = poolCreatedLogs.map((log) => ({
        address: log[events.poolField].toLowerCase(),
        token0: log.token0.toLowerCase(),
        token1: log.token1.toLowerCase(),
      }));
      if (!pools.length) continue;

      const swapLogs = await options.getLogs({
        targets: pools.map((pool) => pool.address),
        eventAbi: events.swapEvent,
        flatten: false,
      });

      swapLogs.forEach((logs: any[], index: number) => {
        const { token0, token1 } = pools[index];
        for (const log of logs) {
          const { amount0, amount1 } = events.swapAmounts(log);
          addOneToken({ balances: dailyVolume, token0, amount0, token1, amount1 });
        }
      });
    }

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

export const getMetricAdapter = (factory: string, chainConfig: MetricChainConfig, events: MetricEvents = LEGACY_EVENTS): SimpleAdapter =>
  getMetricFactoriesAdapter(
    Object.fromEntries(
      Object.entries(chainConfig).map(([chain, { fromBlock, start }]) => [chain, { start, factories: [{ address: factory, fromBlock, events }] }]),
    ),
  );
