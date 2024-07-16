import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"

const gurar = '0xe521fc2C55AF632cdcC3D69E7EFEd93d56c89015';
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

const fetch = async (timestamp: number, _: any, { api, getLogs, createBalances, }: FetchOptions): Promise<FetchResult> => {
  const dailyVolume = createBalances()
  const dailyFees = createBalances()
  const chunkSize = 400;
  let currentOffset = 965; // Slipstream launched after ~970 v2 pools were already created
  const allForSwaps: IForSwap[] = [];
  let unfinished = true;

  while (unfinished) {
    const forSwapsUnfiltered: IForSwap[] = (await api.call({
      target: gurar,
      params: [chunkSize, currentOffset],
      abi: abis.forSwaps,
      chain: CHAIN.BASE,
    }));

    const forSwaps: IForSwap[] = forSwapsUnfiltered.filter(t => Number(t.type) > 0).map((e: any) => {
      return {
        lp: e.lp,
        token0: e.token0,
        token1: e.token1,
        pool_fee: e.pool_fee,
      }
    });

    unfinished = forSwapsUnfiltered.length !== 0;
    currentOffset += chunkSize;
    allForSwaps.push(...forSwaps);
  }
  
  const targets = allForSwaps.map((forSwap: IForSwap) => forSwap.lp)

  let logs: ILog[][] = [];
  const targetChunkSize = 5;
  let currentTargetOffset = 0;
  unfinished = true;

  while (unfinished) {
    let endOffset = currentTargetOffset + targetChunkSize;
    if (endOffset >= targets.length) {
      unfinished = false;
      endOffset = targets.length;
    }

    let currentLogs: ILog[][] = await getLogs({
      targets: targets.slice(currentTargetOffset, endOffset),
      eventAbi: event_swap,
      flatten: false,
    })

    logs.push(...currentLogs);
    currentTargetOffset += targetChunkSize;
  }

  logs.forEach((logs: ILog[], idx: number) => {
    const { token1, pool_fee } = allForSwaps[idx]
    logs.forEach((log: any) => {
      dailyVolume.add(token1, BigInt(Math.abs(Number(log.amount1))))
      dailyFees.add(token1, BigInt( Math.round((((Math.abs(Number(log.amount1))) * Number(pool_fee)) / 1000000)))) // 1% fee represented as pool_fee=10000
    })
  })

  return { dailyVolume, timestamp, dailyFees, dailyRevenue: dailyFees, dailyHoldersRevenue: dailyFees }
}
const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetch as any,
      start: 1714743000,
    }
  }
}
export default adapters;
