
import { FetchOptions } from "../adapters/types";

const _swapEvent = "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)"
// const swapTopic = "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822"

type getDexVolumeParams = { chain: string, fromTimestamp: number, toTimestamp?: number, factory?: string, timestamp: number, pools?: string[], fetchOptions: FetchOptions, pairLengthAbi?: string, pairItemAbi?: string, swapEvent?: string, }
type getDexVolumeFeeParamsV3 = { chain: string, fromTimestamp: number, toTimestamp?: number, factory?: string, factoryFromBlock?: number, timestamp: number, pools?: string[], isFee?: boolean, fetchOptions: FetchOptions, }

type getDexVolumeExportsParams = { chain: string, factory?: string, pools?: string[], pairLengthAbi?: string, pairItemAbi?: string, }
type getDexVolumeExportsParamsV3 = { chain: string, factory?: string, pools?: string[], factoryFromBlock?: number, swapEvent?: string, }

export async function getDexVolume({ factory, timestamp, pools, fetchOptions, pairLengthAbi = 'allPairsLength', pairItemAbi = 'allPairs', swapEvent = _swapEvent }: getDexVolumeParams) {
  const { api } = fetchOptions;
  if (!pools) pools = await api.fetchList({ lengthAbi: pairLengthAbi, itemAbi: pairItemAbi, target: factory! })

  const token0s = await api.multiCall({ abi: 'address:token0', calls: pools! })
  const token1s = await api.multiCall({ abi: 'address:token1', calls: pools! })

  const logs = await fetchOptions.getLogs({
    targets: pools,
    eventAbi: swapEvent,
    flatten: false,
  });
  logs.forEach((log: any[], index: number) => {
    const token0 = token0s[index]
    const token1 = token1s[index]
    if (!log.length) return
    log.forEach((i: any) => {
      // api.add(token0, i.amount0In) // we should count only one side of the swap
      api.add(token0, i.amount0Out)
      // api.add(token1, i.amount1In)
      api.add(token1, i.amount1Out)
    })
  })
  return {
    timestamp,
    dailyVolume: api.getBalancesV2(),
  }
}

export function getDexVolumeExports(options: getDexVolumeExportsParams): any {
  return async (timestamp: number, _cb: any, fetchOptions: FetchOptions) => {
    const params = { ...options, timestamp, fromTimestamp: fetchOptions.fromTimestamp, toTimestamp: fetchOptions.toTimestamp, fetchOptions }
    return getDexVolume(params)
  }
}

type getDexFeesParams = { chain: string, fromTimestamp?: number, toTimestamp?: number, factory?: string, timestamp: number, pools?: string[], lengthAbi?: string, itemAbi?: string, fromBlock?: number, toBlock?: number, fetchOptions: FetchOptions, }
type getDexFeesExportParams = { chain: string, factory?: string, pools?: string[], lengthAbi?: string, itemAbi?: string, }

const feesEvent = "event Fees(address indexed sender, uint256 amount0, uint256 amount1)"
// const feesTopic = '0x112c256902bf554b6ed882d2936687aaeb4225e8cd5b51303c90ca6cf43a8602'
export async function getDexFees({ factory, timestamp, pools, lengthAbi = 'allPairsLength', itemAbi = 'allPairs', fetchOptions, }: getDexFeesParams) {
  const { api } = fetchOptions
  if (!pools) pools = await api.fetchList({ lengthAbi, itemAbi, target: factory! })

  const token0s = await api.multiCall({ abi: 'address:token0', calls: pools!, permitFailure: true, })
  const token1s = await api.multiCall({ abi: 'address:token1', calls: pools!, permitFailure: true, })

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

export function getDexFeesExports(options: getDexFeesExportParams): any {
  return async (timestamp: number, _cb: any, fetchOptions: FetchOptions) => {
    const params = { ...options, timestamp, fromTimestamp: fetchOptions.fromTimestamp, toTimestamp: fetchOptions.toTimestamp, fetchOptions, }
    return getDexFees(params)
  }
}

const v3PoolCreated = 'event PoolCreated(address indexed token0,address indexed token1,uint24 indexed fee,int24 tickSpacing,address pool)';
const v3SwapEvent = 'event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick)'

export async function getDexVolumeFeeV3({ factory, timestamp, pools, factoryFromBlock, isFee = false, fetchOptions: { getLogs, api }, }: getDexVolumeFeeParamsV3) {
  if (!pools) {
    const logs = await getLogs({
      target: factory,
      fromBlock: factoryFromBlock,
      eventAbi: v3PoolCreated,
    });
    pools = logs.map((log: any) => log.pool)
  }

  let fees = [] as any
  if (isFee)
    fees = await api.multiCall({ abi: 'function fee() view returns (uint24)', calls: pools! })
  const token1s = await api.multiCall({ abi: 'address:token1', calls: pools! })

  const logs = await getLogs({
    targets: pools,
    eventAbi: v3SwapEvent,
    flatten: false,
  });
  logs.forEach((log: any[], index: number) => {
    const token1 = token1s[index]
    if (!log.length) return
    let fee = 1
    if (isFee) {
      fee = fees[index] ?? 0
      if (fee === 0) return;
      fee /= 1e6
    }
    log.forEach((i: any) => {
      let amount = Number(i.amount1)
      if (+amount < 0) amount *= -1
      api.add(token1, amount * fee)
    })
  })
  return {
    timestamp,
    dailyVolume: await api.getBalancesV2(),
  }
}

export function getDexVolumeExportsV3(options: getDexVolumeExportsParamsV3) {
  return async (timestamp: number, _cb: any, fetchOptions: FetchOptions) => {
    const params = { ...options, timestamp, fromTimestamp: fetchOptions.fromTimestamp, toTimestamp: fetchOptions.toTimestamp, fetchOptions }
    return getDexVolumeFeeV3(params)
  }
}


export function getDexFeesExportsV3(options: getDexVolumeExportsParamsV3): any {
  return async (timestamp: number, _cb: any, fetchOptions: FetchOptions) => {
    const params = { ...options, timestamp, fromTimestamp: fetchOptions.fromTimestamp, toTimestamp: fetchOptions.toTimestamp, fetchOptions, isFee: true, }
    return getDexVolumeFeeV3(params)
  }
}
