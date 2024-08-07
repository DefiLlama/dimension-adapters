import { FetchOptions, FetchResult, FetchResultV2, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"

const sugar = '0xe521fc2C55AF632cdcC3D69E7EFEd93d56c89015';
const sugarOld = '0x2073D8035bB2b0F2e85aAF5a8732C6f397F9ff9b';
const abis: any = {
  "forSwaps": "function forSwaps(uint256 _limit, uint256 _offset) view returns ((address lp, int24 type, address token0, address token1, address factory, uint256 pool_fee)[])"
}
const abisOld: any = {
  "forSwaps": "function forSwaps() view returns ((address lp, bool stable, address token0, address token1, address factory)[])"
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
const event_swap = 'event Swap(address indexed sender,address indexed to,uint256 amount0In,uint256 amount1In,uint256 amount0Out,uint256 amount1Out)'

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const chunkSize = 400;
  let currentOffset = 0;
  const allForSwaps: IForSwap[] = [];
  let unfinished = true;

  if (options.startOfDay > 1714743000) {

    while (unfinished) {
      const forSwaps: IForSwap[] = (await options.api.call({
        target: sugar,
        params: [chunkSize, currentOffset],
        abi: abis.forSwaps,
        chain: CHAIN.BASE,
      })).filter(t => Number(t.type) < 1).map((e: any) => { // Regular v2 pool are types 0 and -1
        return {
          lp: e.lp,
          token0: e.token0,
          token1: e.token1,
          pool_fee: e.pool_fee,
        }
      });

      unfinished = forSwaps.length !== 0;
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

      let currentLogs: ILog[][] = await options.getLogs({
        targets: targets.slice(currentTargetOffset, endOffset),
        eventAbi: event_swap,
        flatten: false,
      })

      logs.push(...currentLogs);
      currentTargetOffset += targetChunkSize;
    }

    logs.forEach((logs: ILog[], idx: number) => {
      const { token0, token1, pool_fee } = allForSwaps[idx]
      logs.forEach((log: any) => {
        dailyVolume.add(token0, BigInt(Math.abs(Number(log.amount0In))))
        dailyVolume.add(token1, BigInt(Math.abs(Number(log.amount1In))))
        dailyFees.add(token0, BigInt( Math.round((((Math.abs(Number(log.amount0In))) * Number(pool_fee)) / 10000)))) // 1% fee represented as pool_fee=100
        dailyFees.add(token1, BigInt( Math.round((((Math.abs(Number(log.amount1In))) * Number(pool_fee)) / 10000))))
      })
    })

    return { dailyVolume, dailyFees, dailyRevenue: dailyFees, dailyHoldersRevenue: dailyFees }
  }
  else {
    const forSwapsOld: IForSwap[] = (await options.api.call({
      target: sugarOld,
      abi: abisOld.forSwaps,
      chain: CHAIN.BASE,
    })).map((e: any) => {
      return {
        lp: e.lp,
        token0: e.token0,
        token1: e.token1,
        pool_fee: e.stable ? 5 : 30, // v2 0.05% stable swap fees, 0.3% volatile fees
      }
    })

    const targets = forSwapsOld.map((forSwap: IForSwap) => forSwap.lp)

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

      let currentLogs: ILog[][] = await options.getLogs({
        targets: targets.slice(currentTargetOffset, endOffset),
        eventAbi: event_swap,
        flatten: false,
      })

      logs.push(...currentLogs);
      currentTargetOffset += targetChunkSize;
    }

    logs.forEach((logs: ILog[], idx: number) => {
      const { token0, token1, pool_fee } = forSwapsOld[idx]
      logs.forEach((log: any) => {
        dailyVolume.add(token0, log.amount0Out)
        dailyVolume.add(token1, log.amount1Out)
        dailyFees.add(token0, BigInt( Math.round((((Math.abs(Number(log.amount0Out))) * Number(pool_fee)) / 10000))))
        dailyFees.add(token1, BigInt( Math.round((((Math.abs(Number(log.amount1Out))) * Number(pool_fee)) / 10000))))
      })
    })

    return { dailyVolume, dailyFees, dailyRevenue: dailyFees, dailyHoldersRevenue: dailyFees }
  }
}
const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetch as any,
      start: 1693180800,
    }
  }
}
export default adapters;
