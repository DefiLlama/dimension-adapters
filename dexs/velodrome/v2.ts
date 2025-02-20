import { FetchOptions, FetchResultV2 } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"

const sugars = {
  [CHAIN.MODE]: "0x207DfB36A449fd10d9c3bA7d75e76290a0c06731",
  [CHAIN.BOB]: "0x3e71CCdf495d9628D3655A600Bcad3afF2ddea98"
}
const abis: any = {
  "forSwaps": "function forSwaps(uint256 _limit, uint256 _offset) view returns ((address lp, int24 type, address token0, address token1, address factory, uint256 pool_fee)[])"
}

interface IForSwap {
  lp: string;
  type: string;
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
const event_swap_slipstream = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)'

const fetchV2Volume = async ({ api, getLogs, createBalances, chain }: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = createBalances()
  const dailyFees = createBalances()
  const chunkSize = 400;
  let currentOffset = 0;
  const allForSwaps: IForSwap[] = [];
  let unfinished = true;

while (unfinished) {
    const forSwaps: IForSwap[] = (await api.call({
    target: sugars[chain],
    params: [chunkSize, currentOffset],
    abi: abis.forSwaps,
    chain: chain,
    })).filter(t => Number(t.type) >= -1).map((e: any) => {
    return {
        lp: e.lp,
        type: e.type,
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

  let currentLogs: ILog[][] = await getLogs({
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

let slipstreamLogs: ILog[][] = [];
currentTargetOffset = 0;
unfinished = true;

while (unfinished) {
  let endOffset = currentTargetOffset + targetChunkSize;
  if (endOffset >= targets.length) {
    unfinished = false;
    endOffset = targets.length;
  }

  let currentSlipstreamLogs: ILog[][] = await getLogs({
    targets: targets.slice(currentTargetOffset, endOffset),
    eventAbi: event_swap_slipstream,
    flatten: false,
  })

  slipstreamLogs.push(...currentSlipstreamLogs);
  currentTargetOffset += targetChunkSize;
}

slipstreamLogs.forEach((logs: ILog[], idx: number) => {
    const { token1, pool_fee } = allForSwaps[idx]
    logs.forEach((log: any) => {
    dailyVolume.add(token1, BigInt(Math.abs(Number(log.amount1))))
    dailyFees.add(token1, BigInt( Math.round((((Math.abs(Number(log.amount1))) * Number(pool_fee)) / 1000000)))) // 1% fee represented as pool_fee=10000 for Slipstream
    })
})

return { dailyVolume, dailyFees, dailyRevenue: dailyFees, dailyHoldersRevenue: dailyFees }
}

export {
  fetchV2Volume
}
