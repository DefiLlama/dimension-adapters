import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { addOneToken } from "../../helpers/prices";
import { filterPools2 } from "../../helpers/uniswap";

interface ILog {
  address: string;
  data: string;
  transactionHash: string;
  topics: string[];
}
const event_swap = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)'

const fetch = async (fetchOptions: FetchOptions): Promise<FetchResult> => {
  const { api, getLogs, createBalances, } = fetchOptions
  const chain = api.chain
  const dailyVolume = createBalances()
  const dailyFees = createBalances()
  let pairs = await api.fetchList({ lengthAbi: 'allPoolsLength', itemAbi: 'allPools', target: '0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A' })
  let token0s = await api.multiCall({ abi: 'address:token0', calls: pairs })
  let token1s = await api.multiCall({ abi: 'address:token1', calls: pairs })

  const res = await filterPools2({ fetchOptions, pairs, token0s, token1s, minUSDValue: 2000, maxPairSize: 1000 })
  pairs = res.pairs
  token0s = res.token0s
  token1s = res.token1s

  const fees = await api.multiCall({ abi: 'uint256:fee', calls: pairs })

  let logs: ILog[][] = await getLogs({ targets: pairs, eventAbi: event_swap, flatten: false, })
  logs.forEach((logs: ILog[], idx: number) => {
    const token0 = token0s[idx]
    const token1 = token1s[idx]
    const fee = fees[idx]/1e6
    logs.forEach((log: any) => {
      addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0, amount1: log.amount1 })
      addOneToken({ chain, balances: dailyFees, token0, token1, amount0: Number(log.amount0) * fee, amount1: Number(log.amount1) * fee })
    })
  })

  return { dailyVolume, dailyFees, dailyRevenue: dailyFees, dailyHoldersRevenue: dailyFees } as any
}

const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetch as any,
      start: '2024-05-03',
    }
  }
}
export default adapters;
