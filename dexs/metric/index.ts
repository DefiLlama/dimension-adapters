import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";

const factory = "0xe22F9fc0f04486dE25ed6CF1800a4a47aFD82e0C";

const chainConfig: Record<string, { fromBlock: number, start: string }> = {
  [CHAIN.ETHEREUM]: { fromBlock: 24521317, start: "2026-02-23" },
  [CHAIN.BASE]: { fromBlock: 42570144, start: "2026-04-05" },
  [CHAIN.ARBITRUM]: { fromBlock: 435210755, start: "2026-02-17" },
  [CHAIN.BSC]: { fromBlock: 82964761, start: "2026-02-23" },
  [CHAIN.AVAX]: { fromBlock: 78822864, start: "2026-02-23" },
  [CHAIN.POLYGON]: { fromBlock: 83380134, start: "2026-02-23" },
  [CHAIN.MEGAETH]: { fromBlock: 9083666, start: "2026-02-23" },
  [CHAIN.HYPERLIQUID]: { fromBlock: 30774348, start: "2026-03-26" },
  [CHAIN.MONAD]: { fromBlock: 64807339, start: "2026-03-30" },
  [CHAIN.ROBINHOOD]: { fromBlock: 9477535, start: "2026-07-14" },
};

const SwapEvent =
  "event Swap(address sender, address recipient, bool exactInput, int128 amount0Delta, int128 amount1Delta, int16 newTick, uint104 newPositionInBin)";

const poolCreatedEvent = "event PoolCreated(address indexed token0,address indexed token1,address indexed priceProvider,address pool,bytes32 poolId)"

const methodology = {
  Volume:
    "Sum of all input token amounts from Swap events across every pool created by Metric. Pools are discovered on-chain from factory contract's PoolCreated event.",
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const fromBlock = chainConfig[options.chain].fromBlock;

  const poolCreatedLogs = await options.getLogs({
    target: factory,
    eventAbi: poolCreatedEvent,
    fromBlock,
    cacheInCloud: true,
  })

  const tokensByPool: Map<string, { token0: string, token1: string }> = new Map(poolCreatedLogs.map(log => [log.pool.toLowerCase(), { token0: log.token0.toLowerCase(), token1: log.token1.toLowerCase() }]))
  const poolAddresses = poolCreatedLogs.map(log => log.pool.toLowerCase());
  if (!poolAddresses.length) return { dailyVolume };

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

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  pullHourly: true,
  adapter: chainConfig,
  methodology,
};

export default adapter;
