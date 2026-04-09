import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const API_BASE = "https://api.metric.xyz";

const API_CHAIN_NAMES: Record<string, string> = {
  [CHAIN.ETHEREUM]: "ethereum",
  [CHAIN.BASE]: "base",
  [CHAIN.ARBITRUM]: "arbitrum",
  [CHAIN.BSC]: "bsc",
  [CHAIN.AVAX]: "avax",
  [CHAIN.POLYGON]: "polygon",
};

const SwapEvent =
  "event Swap(address sender, address recipient, bool exactInput, int128 amount0Delta, int128 amount1Delta, int16 newTick, uint104 newPositionInBin)";

const methodology = {
  Volume:
    "Sum of all input token amounts from Swap events across every pool deployed by the Metric factory.",
};

interface PoolMeta {
  poolAddress: string;
  token0: string;
  token1: string;
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const chainName = API_CHAIN_NAMES[options.chain];

  const pools: PoolMeta[] = await httpGet(`${API_BASE}/${chainName}/metadata`);
  if (!pools.length) return { dailyVolume };

  const poolAddresses = pools.map((p) => p.poolAddress);
  const tokensByIndex = pools.map((p) => ({ token0: p.token0, token1: p.token1 }));

  const allLogs = await options.getLogs({
    targets: poolAddresses,
    eventAbi: SwapEvent,
    flatten: false,
  });

  (allLogs as any[][]).forEach((logs: any[], index: number) => {
    if (!logs.length) return;
    const { token0, token1 } = tokensByIndex[index];
    for (const log of logs) {
      const amount0 = BigInt(log.amount0Delta);
      const amount1 = BigInt(log.amount1Delta);
      if (amount0 > 0n) {
        dailyVolume.add(token0, amount0);
      } else if (amount1 > 0n) {
        dailyVolume.add(token1, amount1);
      }
    }
  });

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: "2026-02-23" },
    [CHAIN.BASE]: { fetch, start: "2026-04-05" },
    [CHAIN.ARBITRUM]: { fetch, start: "2026-02-17" },
    [CHAIN.BSC]: { fetch, start: "2026-02-23" },
    [CHAIN.AVAX]: { fetch, start: "2026-02-23" },
    [CHAIN.POLYGON]: { fetch, start: "2026-02-23" },
  },
  methodology,
};

export default adapter;
