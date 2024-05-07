
import { Balances, ChainApi, cache } from "@defillama/sdk";
import { BaseAdapter, FetchV2, IJSON, SimpleAdapter } from "../adapters/types";
import { addOneToken } from "./prices";
import { ethers } from "ethers";


export async function filterPools({ api, pairs, createBalances }: { api: ChainApi, pairs: IJSON<string[]>, createBalances: any }): Promise<IJSON<number>> {
  const balanceCalls = Object.entries(pairs).map(([pair, tokens]) => tokens.map(i => ({ target: i, params: pair }))).flat()
  const res = await api.multiCall({ abi: 'erc20:balanceOf', calls: balanceCalls, permitFailure: true, })
  const balances: Balances = createBalances()
  const pairBalances: IJSON<Balances> = {}
  res.forEach((bal, i) => {
    balances.add(balanceCalls[i].target, bal)
    if (!pairBalances[balanceCalls[i].params]) {
      pairBalances[balanceCalls[i].params] = createBalances()
    }
    pairBalances[balanceCalls[i].params].add(balanceCalls[i].target, bal ?? 0)
  })
  // we do this to cache price results
  await balances.getUSDValue()
  const filteredPairs: IJSON<number> = {}
  for (const pair of Object.keys(pairs)) {
    const pooledValue = await pairBalances[pair].getUSDValue()
    if (pooledValue < 1000)
      continue;
    filteredPairs[pair] = pooledValue
  }

  if (Object.keys(filteredPairs).length < 42)
    return filteredPairs

  // if there are more than 42 pools, we need to filter out the ones with the lowest value
  const sortedPairs = Object.entries(filteredPairs).sort((a, b) => b[1] - a[1]).slice(0, 42)
  return Object.fromEntries(sortedPairs)
}

const defaultV2SwapEvent = 'event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)'

export const getUniV2LogAdapter: any = ({ factory, fees = 0.003, swapEvent = defaultV2SwapEvent, }: UniV2Config): FetchV2 => {
  const fetch: FetchV2 = async ({ createBalances, getLogs, chain, api }) => {
    factory = factory.toLowerCase()
    const cacheKey = `tvl-adapter-cache/cache/uniswap-forks/${factory}-${chain}.json`

    const { pairs, token0s, token1s } = await cache.readCache(cacheKey, { readFromR2Cache: true })
    if (!pairs?.length) throw new Error('No pairs found, is there TVL adapter for this already?')
    const pairObject: IJSON<string[]> = {}
    pairs.forEach((pair: string, i: number) => {
      pairObject[pair] = [token0s[i], token1s[i]]
    })
    const dailyVolume = createBalances()
    const filteredPairs = await filterPools({ api, pairs: pairObject, createBalances })
    await Promise.all(Object.keys(filteredPairs).map(async (pair) => {
      const [token0, token1] = pairObject[pair]
      const logs = await getLogs({ target: pair, eventAbi: swapEvent })
      logs.forEach(log => {
        addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0In, amount1: log.amount1In })
        addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0Out, amount1: log.amount1Out })
      })
    }))

    return { dailyVolume, dailyFees: dailyVolume.clone(fees) }
  }
  return fetch
}

const defaultV3SwapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)'
const defaultPoolCreatedEvent = 'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)'
export const getUniV3LogAdapter: any = ({ factory, poolCreatedEvent = defaultPoolCreatedEvent, swapEvent = defaultV3SwapEvent, }: UniV3Config): FetchV2 => {
  const fetch: FetchV2 = async ({ createBalances, getLogs, chain, api }) => {
    factory = factory.toLowerCase()
    const cacheKey = `tvl-adapter-cache/cache/logs/${chain}/${factory}.json`
    const iface = new ethers.Interface([poolCreatedEvent])
    let { logs } = await cache.readCache(cacheKey, { readFromR2Cache: true })
    if (!logs?.length) throw new Error('No pairs found, is there TVL adapter for this already?')
    logs = logs.map((log: any) => iface.parseLog(log)?.args)
    const pairObject: IJSON<string[]> = {}
    const fees: any = {}
    logs.forEach((log: any) => {
      pairObject[log.pool] = [log.token0, log.token1]
      fees[log.pool] = (log.fee?.toString() || 0) / 1e6 // seem some protocol v3 forks does not have fee in the log when not use defaultPoolCreatedEvent
    })
    const filteredPairs = await filterPools({ api, pairs: pairObject, createBalances })
    const dailyVolume = createBalances()
    const dailyFees = createBalances()

    await Promise.all(Object.keys(filteredPairs).map(async (pair) => {
      const [token0, token1] = pairObject[pair]
      const fee = fees[pair]
      const logs = await getLogs({ target: pair, eventAbi: swapEvent })
      logs.forEach(log => {
        addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0, amount1: log.amount1 })
        addOneToken({ chain, balances: dailyFees, token0, token1, amount0: log.amount0.toString() * fee, amount1: log.amount1.toString() * fee })
      })
    }))
    return { dailyVolume, dailyFees }
  }
  return fetch
}

type UniV2Config = {
  factory: string,
  fees?: number,
  swapEvent?: string,
}

type UniV3Config = {
  factory: string,
  poolCreatedEvent?: string,
  swapEvent?: string,
}

export function uniV2Exports(config: IJSON<UniV2Config>) {
  const exportObject: BaseAdapter = {}
  Object.entries(config).map(([chain, chainConfig]) => {
    exportObject[chain] = {
      fetch: getUniV2LogAdapter(chainConfig),
      start: 0,
    }
  })
  return { adapter: exportObject, version: 2 } as SimpleAdapter
}

export function uniV3Exports(config: IJSON<UniV3Config>) {
  const exportObject: BaseAdapter = {}
  Object.entries(config).map(([chain, chainConfig]) => {
    exportObject[chain] = {
      fetch: getUniV3LogAdapter(chainConfig),
      start: 0,
    }
  })
  return { adapter: exportObject, version: 2 } as SimpleAdapter
}
