import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const sugarOld = '0x3e532BC1998584fe18e357B5187897ad0110ED3A'; // old Sugar version doesn't properly support pagination
const sugar = '0xdE2aE25FB984dd60C77dcF6489Be9ee6438eC195';
const abis: any = {
  "forSwaps": "function forSwaps(uint256 _limit, uint256 _offset) view returns ((address lp, int24 type, address token0, address token1, address factory, uint256 pool_fee)[])"
}

interface IForSwap {
  lp: string;
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
const event_swap = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)'

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  let chunkSize = 400;
  let currentOffset = 630; // Slipstream launched after ~650 v2 pools were already created
  const allForSwaps: IForSwap[] = [];
  let unfinished = true;
  let sugarContract = sugar;

  // before the new Sugar is deployed, we must use the old Sugar contract, and make one large Sugar call
  if (options.startOfDay < 1715160600) {
    chunkSize = 1800;
    currentOffset = 0;
    sugarContract = sugarOld;
  }

  while (unfinished) {
    const forSwaps: IForSwap[] = (await options.api.call({
      target: sugarContract,
      params: [chunkSize, currentOffset], // Slipstream launched after ~650 v2 pools were already created
      abi: abis.forSwaps,
      chain: CHAIN.OPTIMISM,
    })).filter(t => Number(t.type) > 0).map((e: any) => {
      return {
        lp: e.lp,
        token0: e.token0,
        token1: e.token1,
        pool_fee: e.pool_fee,
      }
    })

    unfinished = forSwaps.length !== 0;
    currentOffset += chunkSize;
    allForSwaps.push(...forSwaps);
  }

  const targets: string[] = [...new Set(allForSwaps.map((forSwap: IForSwap) => forSwap.lp))]

  const logs: ILog[][] = await options.getLogs({
    targets,
    eventAbi: event_swap,
    flatten: false,
  })

  logs.forEach((logs: ILog[], idx: number) => {
    const { token1, pool_fee } = allForSwaps[idx]
    logs.forEach((log: any) => {
      dailyVolume.add(token1, BigInt(Math.abs(Number(log.amount1))))
      dailyFees.add(token1, BigInt( Math.round((((Math.abs(Number(log.amount1))) * Number(pool_fee)) / 1000000)))) // 1% fee represented as pool_fee=10000
    })
  })

  return { dailyVolume, dailyFees, dailyRevenue: dailyFees, dailyHoldersRevenue: dailyFees }
}
const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.OPTIMISM]: {
      fetch: fetch as any,
      start: 1709724600,
    }
  }
}
export default adapters;
