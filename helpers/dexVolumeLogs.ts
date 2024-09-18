
import { FetchOptions, IJSON } from "../adapters/types";
import { filterPools, filterPools2 } from "./uniswap";

type getDexFeesParams = { chain: string, fromTimestamp?: number, toTimestamp?: number, factory?: string, timestamp: number, pools?: string[], lengthAbi?: string, itemAbi?: string, fromBlock?: number, toBlock?: number, fetchOptions: FetchOptions, }

const feesEvent = "event Fees(address indexed sender, uint256 amount0, uint256 amount1)"
// const feesTopic = '0x112c256902bf554b6ed882d2936687aaeb4225e8cd5b51303c90ca6cf43a8602'
export async function getDexFees({ factory, timestamp, pools, lengthAbi = 'allPairsLength', itemAbi = 'allPairs', fetchOptions, }: getDexFeesParams) {
  const { api } = fetchOptions
  if (!pools) pools = await api.fetchList({ lengthAbi, itemAbi, target: factory! })

  let token0s = await api.multiCall({ abi: 'address:token0', calls: pools!, permitFailure: true, })
  let token1s = await api.multiCall({ abi: 'address:token1', calls: pools!, permitFailure: true, })

  const res = await filterPools2({ fetchOptions, pairs: pools, token0s, token1s })
  pools = res.pairs
  token0s = res.token0s
  token1s = res.token1s

  const logs = await fetchOptions.getLogs({
    targets: pools,
    eventAbi: feesEvent,
    flatten: false,
  });
  logs.forEach((log: any[], index: number) => {
    const token0 = token0s[index]
    const token1 = token1s[index]
    if (!log.length || !token0 || !token1) return
    log.forEach((i: any) => {
      api.add(token0, i.amount0)
      api.add(token1, i.amount1)
    })
  })
  const value = api.getBalancesV2()
  return {
    timestamp,
    dailyFees: value,
    dailyRevenue: value,
    dailyHoldersRevenue: value,
  }
}
