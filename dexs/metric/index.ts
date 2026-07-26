import { BaseAdapter, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";

// Metric ships pools from more than one factory version. The same factory
// address is reused across chains, but each version is deployed at a different
// block on each chain, and not every version exists on every chain.
const FACTORY_LEGACY = "0xe22F9fc0f04486dE25ed6CF1800a4a47aFD82e0C";
const FACTORY_V1 = "0x622911384e7973439b8be305f5e3Fc3c5736EDe4";

// A single factory deployment on a given chain. `fromBlock` is the block the
// factory was created at (getLogs lower bound). Leave `fromBlock` at 0 for a
// version whose deploy block is not yet known — such entries are skipped at
// runtime until filled in.
type FactoryDeploy = { address: string; fromBlock: number };

// Per chain: the earliest `start` across its deployments (fed to the exported
// adapter) plus the list of factory deployments to scan for pools.
type ChainConfig = { start: string; factories: FactoryDeploy[] };

const chainConfig: Record<string, ChainConfig> = {
  [CHAIN.ETHEREUM]: {
    start: "2026-02-23",
    factories: [
      { address: FACTORY_LEGACY, fromBlock: 24521317 }, // 2026-02-23
      { address: FACTORY_V1, fromBlock: 25524981 }, // 2026-07-13
    ],
  },
  [CHAIN.BASE]: {
    start: "2026-04-05",
    factories: [
      { address: FACTORY_LEGACY, fromBlock: 42570144 }, // 2026-04-05
      { address: FACTORY_V1, fromBlock: 48585753 }, // 2026-07-13
    ],
  },
  [CHAIN.ARBITRUM]: {
    start: "2026-02-17",
    factories: [
      { address: FACTORY_LEGACY, fromBlock: 435210755 }, // 2026-02-17
      { address: FACTORY_V1, fromBlock: 486842281 }, // 2026-07-23
    ],
  },
  [CHAIN.BSC]: {
    start: "2026-02-23",
    factories: [
      { address: FACTORY_LEGACY, fromBlock: 82964761 }, // 2026-02-23
    ],
  },
  [CHAIN.AVAX]: {
    start: "2026-02-23",
    factories: [
      { address: FACTORY_LEGACY, fromBlock: 78822864 }, // 2026-02-23
    ],
  },
  [CHAIN.POLYGON]: {
    start: "2026-02-23",
    factories: [
      { address: FACTORY_LEGACY, fromBlock: 83380134 }, // 2026-02-23
    ],
  },
  [CHAIN.MEGAETH]: {
    start: "2026-02-23",
    factories: [
      { address: FACTORY_LEGACY, fromBlock: 9083666 }, // 2026-02-23
    ],
  },
  [CHAIN.HYPERLIQUID]: {
    start: "2026-03-26",
    factories: [
      { address: FACTORY_LEGACY, fromBlock: 30774348 }, // 2026-03-26
    ],
  },
  [CHAIN.MONAD]: {
    start: "2026-03-30",
    factories: [
      { address: FACTORY_LEGACY, fromBlock: 64807339 }, // 2026-03-30
    ],
  },
  [CHAIN.ROBINHOOD]: {
    start: "2026-07-14",
    factories: [
      { address: FACTORY_LEGACY, fromBlock: 9477535 }, // 2026-07-14
      { address: FACTORY_V1, fromBlock: 8800150 }, // 2026-07-13
    ],
  },
};

const SwapEvent =
  "event Swap(address sender, address recipient, bool exactInput, int128 amount0Delta, int128 amount1Delta, int16 newTick, uint104 newPositionInBin)";

const poolCreatedEvent =
  "event PoolCreated(address indexed token0,address indexed token1,address indexed priceProvider,address pool,bytes32 poolId)";

const methodology = {
  Volume:
    "Sum of all input token amounts from Swap events across every pool created by Metric. Pools are discovered on-chain from the PoolCreated event of every Metric factory (all versions) deployed on the chain.",
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  for (const { address, fromBlock } of chainConfig[options.chain].factories) {
    if (!fromBlock) continue; // deploy block not configured yet

    const poolCreatedLogs = await options.getLogs({
      target: address,
      eventAbi: poolCreatedEvent,
      fromBlock,
      cacheInCloud: true,
    });

    const tokensByPool: Map<string, { token0: string; token1: string }> = new Map(
      poolCreatedLogs.map((log) => [
        log.pool.toLowerCase(),
        { token0: log.token0.toLowerCase(), token1: log.token1.toLowerCase() },
      ])
    );
    const poolAddresses = poolCreatedLogs.map((log) => log.pool.toLowerCase());
    if (!poolAddresses.length) continue;

    const swapLogs = await options.getLogs({
      targets: poolAddresses,
      eventAbi: SwapEvent,
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
  }

  return { dailyVolume };
};

// Runtime factory config is kept separate from the exported `adapter` object:
// cli/buildModules.ts strips any non-whitelisted keys from each adapter[chain]
// entry, so only `start` is surfaced there while `fetch` reads `chainConfig`.
const adapterConfig: BaseAdapter = Object.fromEntries(
  Object.entries(chainConfig).map(([chain, { start }]) => [chain, { start }])
);

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  pullHourly: true,
  adapter: adapterConfig,
  methodology,
};

export default adapter;
