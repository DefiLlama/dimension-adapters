import * as sdk from "@defillama/sdk";
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const sugarOld = '0x3e532BC1998584fe18e357B5187897ad0110ED3A'; // old Sugar version doesn't properly support pagination

const superchainConfig: any = {
  [CHAIN.OPTIMISM]: {
    sugar: '0xdE2aE25FB984dd60C77dcF6489Be9ee6438eC195',
  },
  [CHAIN.MODE]: {
    sugar: '0x8A5e97184E8850064805fAc2427ce7728689De5B',
  },
  [CHAIN.LISK]: {
    sugar: '0x0F5B7D59690F99f34081E24557f022d06d580BB6',
  },
  [CHAIN.INK]: {
    sugar: '0xD938B20f40505e33b7C131e6aDD6C6FF7380094A',
  },
  [CHAIN.SONEIUM]: {
    sugar: '0xB1d0DFFe6260982164B53EdAcD3ccd58B081889d',
  },
  [CHAIN.FRAXTAL]: {
    sugar: '0xB1d0DFFe6260982164B53EdAcD3ccd58B081889d',
  },
  [CHAIN.UNICHAIN]: {
    sugar: '0xB1d0DFFe6260982164B53EdAcD3ccd58B081889d',
  },
  [CHAIN.SWELLCHAIN]: {
    sugar: '0xF179eD1FBbDC975C45AB35111E6Bf7430cCca14F',
  },
  [CHAIN.CELO]: {
    sugar: '0x9972174fcE4bdDFFff14bf2e18A287FDfE62c45E',
  },
}

interface IForSwap {
  lp: string;
  type: number;
  token0: string;
  token1: string;
  pool_fee: string;
}

interface ILog {
  address: string;
  data: string;
  transactionHash: string;
  topics: string[];
}
const forSwaps = 'function forSwaps(uint256 _limit, uint256 _offset) view returns ((address lp, int24 type, address token0, address token1, address factory, uint256 pool_fee)[])'
const event_swap = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)'

const fetch = async (_: any, _1: any, fetchOptions: FetchOptions): Promise<FetchResult> => {
  const { api, createBalances, getFromBlock, startOfDay, chain, getLogs } = fetchOptions
  const [fromBlock, toBlock] = await Promise.all([getFromBlock(), await api.getBlock() - 100])
  const dailyVolume = createBalances()
  const dailyFees = createBalances()
  const pairs: string[] = [];
  const pairInfoMap: Record<string, IForSwap> = {};
  let currentOffset = 0;

  const isOldOptimism = chain === CHAIN.OPTIMISM && startOfDay < 1715160600;
  const chunkSize = isOldOptimism ? 1800 : 400;
  const sugarContract = isOldOptimism ? sugarOld : superchainConfig[chain].sugar;

  while (true) {
    const rawSwaps: IForSwap[] = await api.call({ target: sugarContract, params: [chunkSize, currentOffset], abi: forSwaps, permitFailure: true });

    if (!rawSwaps || rawSwaps.length === 0) break;
    const seen = new Set<string>();

    rawSwaps.forEach((e: any) => {
      if (Number(e.type) <= 0) return;
      const lp = e.lp.toLowerCase();
      if (seen.has(lp)) return;
      seen.add(lp);
      const entry = {
        lp,
        type: e.type,
        token0: e.token0,
        token1: e.token1,
        pool_fee: e.pool_fee,
      };
      pairs.push(lp);
      pairInfoMap[lp] = entry;
    });

    currentOffset += chunkSize;
  }

  sdk.log('velodrome pairs', pairs.length, 'all pairs', pairs.length, chain)
  const targetChunkSize = 10;
  const pairChunks = sdk.util.sliceIntoChunks(pairs, targetChunkSize);

  for (let chunkIndex = 0; chunkIndex < pairChunks.length; chunkIndex++) {
    const targets = pairChunks[chunkIndex];
    const logs = await getLogs({ targets, eventAbi: event_swap, flatten: false, fromBlock, toBlock, skipCache: true, skipCacheRead: true });

    logs.forEach((logs: ILog[], idx) => {
      const pool = targets[idx];
      
      if (pairInfoMap[pool]) {
        const { token1, pool_fee } = pairInfoMap[pool];
  
        logs.forEach((log: any) => {
          const amount1 = Math.abs(Number(log.amount1));
          const fee = Math.round((amount1 * Number(pool_fee)) / 1_000_000);
  
          dailyVolume.add(token1, BigInt(amount1));
          dailyFees.add(token1, BigInt(fee));
        });
      }
    });

    sdk.log(`Velodrome ${chain} chunk ${chunkIndex + 1}/${pairChunks.length} processed`);
  }

  return { dailyVolume, dailyFees, dailyRevenue: dailyFees, dailyHoldersRevenue: dailyFees }
}

const adapters: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.OPTIMISM]: {
      fetch,
      start: '2024-03-06',
    },
    [CHAIN.MODE]: {
      fetch,
      start: '2024-11-13',
    },
    [CHAIN.LISK]: {
      fetch,
      start: '2024-11-13',
    },
    [CHAIN.FRAXTAL]: {
      fetch,
      start: '2024-11-19',
    },
    [CHAIN.INK]: {
      fetch,
      start: '2025-01-14',
    },
    [CHAIN.SONEIUM]: {
      fetch,
      start: '2025-01-14',
    },
    [CHAIN.UNICHAIN]: {
      fetch,
      start: '2025-03-04',
    },
    [CHAIN.SWELLCHAIN]: {
      fetch,
      start: '2025-02-25',
    },
    [CHAIN.CELO]: {
      fetch,
      start: '2025-04-02',
    },
  }
}

export default adapters;
