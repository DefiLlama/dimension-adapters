import { CHAIN } from "../../helpers/chains";
import type { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";

// MaverickV2Factory — same address everywhere except zkSync Era
const DEFAULT_FACTORY = "0x0A7e848Aca42d879EF06507Fca0E7b33A0a63c1e";
const FACTORY: Record<string, string> = {
  [CHAIN.ETHEREUM]: DEFAULT_FACTORY,
  [CHAIN.ARBITRUM]: DEFAULT_FACTORY,
  [CHAIN.BSC]: DEFAULT_FACTORY,
  [CHAIN.BASE]: DEFAULT_FACTORY,
  [CHAIN.SCROLL]: DEFAULT_FACTORY,
  [CHAIN.ERA]: "0x7A6902af768a06bdfAb4F076552036bf68D1dc56",
};

const FACTORY_ABI = {
  poolCount: "function poolCount() view returns (uint256)",
  lookup: "function lookup(uint256 startIndex, uint256 endIndex) view returns (address[] pools)",
};

const POOL_ABI = {
  tokenA: "function tokenA() view returns (address)",
  tokenB: "function tokenB() view returns (address)",
  fee: "function fee(bool tokenAIn) view returns (uint256)", // D18: 1e18 == 100%
};

// topic0: 0x103ed084e94a44c8f5f6ba8e3011507c41063177e29949083c439777d8d63f60
const POOL_SWAP_EVENT =
  "event PoolSwap(address sender, address recipient, (uint256 amount, bool tokenAIn, bool exactOutput, int32 tickLimit) params, uint256 amountIn, uint256 amountOut)";

const D18 = 10n ** 18n;

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { api, getLogs, createBalances, chain } = options;
  const dailyFees = createBalances();
  const dailyVolume = createBalances();
  const factory = FACTORY[chain];

  const poolCount: string = await api.call({ target: factory, abi: FACTORY_ABI.poolCount });
  if (Number(poolCount) === 0) return { dailyVolume, dailyFees };

  const pools: string[] = await api.call({
    target: factory,
    abi: FACTORY_ABI.lookup,
    params: [0, poolCount],
  });

  const [tokenAs, tokenBs, feeAIns, feeBIns]: [string[], string[], string[], string[]] =
    await Promise.all([
      api.multiCall({ calls: pools, abi: POOL_ABI.tokenA }),
      api.multiCall({ calls: pools, abi: POOL_ABI.tokenB }),
      api.multiCall({ calls: pools.map((p) => ({ target: p, params: [true] })), abi: POOL_ABI.fee }),
      api.multiCall({ calls: pools.map((p) => ({ target: p, params: [false] })), abi: POOL_ABI.fee }),
    ]);

  // one array of logs per pool
  const logsPerPool: any[][] = await getLogs({
    targets: pools,
    eventAbi: POOL_SWAP_EVENT,
    flatten: false,
  });

  logsPerPool.forEach((logs, i) => {
    const feeA = BigInt(feeAIns[i]);
    const feeB = BigInt(feeBIns[i]);
    for (const log of logs) {
      const tokenAIn: boolean = log.params.tokenAIn;
      const amountIn = BigInt(log.amountIn.toString());
      const inToken = tokenAIn ? tokenAs[i] : tokenBs[i];
      const feeRate = tokenAIn ? feeA : feeB;

      // Maverick charges the swap fee on the input token
      dailyVolume.add(inToken, amountIn);
      dailyFees.add(inToken, (amountIn * feeRate) / D18);
    }
  });

  return { dailyVolume, dailyFees };
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: {
    [CHAIN.ETHEREUM]: { start: "2024-06-03" },
    [CHAIN.ARBITRUM]: { start: "2024-06-03" },
    [CHAIN.ERA]: { start: "2024-06-03" },
    [CHAIN.BSC]: { start: "2024-06-03" },
    [CHAIN.BASE]: { start: "2024-06-03" },
    [CHAIN.SCROLL]: { start: "2024-07-29" },
  },
};

export default adapter;
