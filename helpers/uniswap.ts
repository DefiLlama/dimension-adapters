import ADDRESSES from './coreAssets.json'

import { Balances, ChainApi, cache } from "@defillama/sdk";
import { BaseAdapter, FetchOptions, FetchV2, IJSON, SimpleAdapter } from "../adapters/types";
import { addOneToken } from "./prices";
import { ethers } from "ethers";

const ZERO_ADDRESS = ADDRESSES.null;

export async function filterPools({ api, pairs, createBalances, maxPairSize = 42, minUSDValue = 200 }: { api: ChainApi, pairs: IJSON<string[]>, createBalances: any, maxPairSize?: number, minUSDValue?: number }): Promise<IJSON<number>> {
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
    if (pooledValue < minUSDValue)
      continue;
    filteredPairs[pair] = pooledValue
  }

  if (Object.keys(filteredPairs).length < maxPairSize)
    return filteredPairs

  // if there are more than 21 pools, we need to filter out the ones with the lowest value
  const sortedPairs = Object.entries(filteredPairs).sort((a, b) => b[1] - a[1]).slice(0, maxPairSize)
  return Object.fromEntries(sortedPairs)
}

const defaultV2SwapEvent = 'event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)'
const notifyRewardEvent = 'event NotifyReward(address indexed from,address indexed reward,uint256 indexed epoch,uint256 amount)';

export const getUniV2LogAdapter: any = (v2Config: UniV2Config): FetchV2 => {
  let { factory, fees = 0.003, swapEvent = defaultV2SwapEvent, stableFees = 1 / 10000, voter, maxPairSize, customLogic, blacklistedAddresses, revenueRatio, protocolRevenueRatio, holdersRevenueRatio, } = v2Config
  const fetch: FetchV2 = async (fetchOptions) => {
    const { createBalances, getLogs, chain, api } = fetchOptions
    let blacklistedAddressesSet: any
    if (blacklistedAddresses) {
      blacklistedAddressesSet = new Set(blacklistedAddresses.map(i => i.toLowerCase()))
    }

    if (!chain) throw new Error('Wrong version?')


    factory = factory.toLowerCase()
    const cacheKey = `tvl-adapter-cache/cache/uniswap-forks/${factory}-${chain}.json`

    const { pairs, token0s, token1s } = await cache.readCache(cacheKey, { readFromR2Cache: true })
    if (!pairs?.length) throw new Error('No pairs found, is there TVL adapter for this already?')
    const pairObject: IJSON<string[]> = {}
    pairs.forEach((pair: string, i: number) => {
      pairObject[pair] = [token0s[i], token1s[i]]
    })
    const dailyVolume = createBalances()
    const dailyFees = createBalances()
    const filteredPairs = await filterPools({ api, pairs: pairObject, createBalances, maxPairSize })
    const pairIds = Object.keys(filteredPairs)
    api.log(`uniV2RunLog: Filtered to ${pairIds.length}/${pairs.length} pairs Factory: ${factory} Chain: ${chain}`)
    const isStablePair = await api.multiCall({ abi: 'bool:stable', calls: pairIds, permitFailure: true })

    if (!pairIds.length) return { dailyVolume, dailyFees }

    const allLogs = await getLogs({ targets: pairIds, eventAbi: swapEvent, flatten: false })
    allLogs.map((logs: any, index) => {
      if (!logs.length) return;
      const pair = pairIds[index]
      let _fees = isStablePair[index] ? stableFees : fees
      const [token0, token1] = pairObject[pair]
      logs.forEach((log: any) => {
        if (blacklistedAddressesSet) {
          if (
            blacklistedAddressesSet.has(log.sender.toLowerCase()) ||
            blacklistedAddressesSet.has(log.to.toLowerCase()))
            return;
        }
        addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0In, amount1: log.amount1In })
        addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0Out, amount1: log.amount1Out })
        addOneToken({ chain, balances: dailyFees, token0, token1, amount0: Number(log.amount0In) * _fees, amount1: Number(log.amount1In) * _fees })
        addOneToken({ chain, balances: dailyFees, token0, token1, amount0: Number(log.amount0Out) * _fees, amount1: Number(log.amount1Out) * _fees })
      })
    })

    if (customLogic)
      return customLogic({ pairObject, dailyVolume, dailyFees, filteredPairs, fetchOptions })


    if (voter) {
      const dailyBribesRevenue = createBalances()
      const bribeContracts: string[] = await api.multiCall({ abi: 'function gauges(address) view returns (address)', calls: pairIds, target: voter })
      let feesVotingReward: string[] = await api.multiCall({ abi: 'address:feesVotingReward', calls: bribeContracts, permitFailure: true })
      if (feesVotingReward.filter((e: any) => e).length === 0) {
        api.log('No feesVotingReward found, trying bribes')
        feesVotingReward = bribeContracts
      }
      api.log(bribeContracts.length, 'bribes contracts found')

      const logs = await getLogs({ targets: feesVotingReward.filter(i => i !== ZERO_ADDRESS), eventAbi: notifyRewardEvent, })

      logs.map((e: any) => {
        dailyBribesRevenue.add(e.reward, e.amount)
      })

      return { dailyVolume, dailyFees, dailyRevenue: dailyFees, dailyHoldersRevenue: dailyFees, dailyBribesRevenue }
    }

    const response: any = { dailyVolume, dailyFees }

    if (revenueRatio || revenueRatio === 0) {
      response.dailyRevenue = dailyFees.clone(revenueRatio)
      response.dailySupplySideRevenue = dailyFees.clone(1 - revenueRatio)
    }
    if (v2Config.hasOwnProperty('protocolRevenueRatio')) response.dailyProtocolRevenue = dailyFees.clone(protocolRevenueRatio)
    if (v2Config.hasOwnProperty('holdersRevenueRatio')) response.dailyHoldersRevenue = dailyFees.clone(holdersRevenueRatio)

    return response
  }
  return fetch
}

const defaultV3SwapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)'
const defaultPoolCreatedEvent = 'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)'
const algebraV3PoolCreatedEvent = 'event Pool (address indexed token0, address indexed token1, address pool)'
const algebraV3SwapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 price, uint128 liquidity, int24 tick, uint24 overrideFee, uint24 pluginFee)'
export const getUniV3LogAdapter: any = ({ factory, poolCreatedEvent = defaultPoolCreatedEvent, swapEvent = defaultV3SwapEvent, customLogic, isAlgebraV3 = false, revenueRatio, protocolRevenueRatio, holdersRevenueRatio, }: UniV3Config): FetchV2 => {
  const fetch: FetchV2 = async (fetchOptions) => {
    const { createBalances, getLogs, chain, api } = fetchOptions

    if (!chain) throw new Error('Wrong version?')

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

    if (isAlgebraV3) {
      let _fees = await api.multiCall({ abi: 'function fee() view returns (uint24)', calls: logs.map((log: any) => log.pool) })
      _fees.forEach((fee: any, i: number) => fees[logs[i].pool] = fee / 1e6)
    }
    const filteredPairs = await filterPools({ api, pairs: pairObject, createBalances })
    const dailyVolume = createBalances()
    const dailyFees = createBalances()

    if (!Object.keys(filteredPairs).length) return { dailyVolume, dailyFees }

    const allLogs = await getLogs({ targets: Object.keys(filteredPairs), eventAbi: swapEvent, flatten: false })
    allLogs.map((logs: any, index) => {
      if (!logs.length) return;
      const pair = Object.keys(filteredPairs)[index]
      const [token0, token1] = pairObject[pair]
      const fee = fees[pair]
      logs.forEach((log: any) => {
        addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0, amount1: log.amount1 })
        addOneToken({ chain, balances: dailyFees, token0, token1, amount0: log.amount0.toString() * fee, amount1: log.amount1.toString() * fee })
      })
    })

    if (customLogic) {
      return customLogic({ pairObject, dailyVolume, dailyFees, filteredPairs, fetchOptions })
    }
    const response: any = { dailyVolume, dailyFees }

    if (revenueRatio || revenueRatio === 0) response.dailyRevenue = dailyFees.clone(revenueRatio)
    if (protocolRevenueRatio || protocolRevenueRatio === 0) response.dailyProtocolRevenue = dailyFees.clone(protocolRevenueRatio)
    if (holdersRevenueRatio || holdersRevenueRatio === 0) response.dailyHoldersRevenue = dailyFees.clone(holdersRevenueRatio)

    return response
  }
  return fetch
}

type UniV2Config = {
  factory: string,
  fees?: number,
  swapEvent?: string,
  stableFees?: number,
  voter?: string,
  maxPairSize?: number,
  customLogic?: any,
  start?: number | string,
  blacklistedAddresses?: string[],
  revenueRatio?: number,
  protocolRevenueRatio?: number,
  holdersRevenueRatio?: number,
}

type UniV3Config = {
  factory: string,
  poolCreatedEvent?: string,
  swapEvent?: string,
  customLogic?: any,
  isAlgebraV3?: boolean,
  revenueRatio?: number,
  protocolRevenueRatio?: number,
  holdersRevenueRatio?: number,
  start?: number | string,
}

export function uniV2Exports(config: IJSON<UniV2Config>, { runAsV1 = false } = {}) {
  const exportObject: BaseAdapter = {}
  const exportObjectV1: BaseAdapter = {}


  Object.entries(config).map(([chain, chainConfig]) => {
    const fetch: any = getUniV2LogAdapter(chainConfig)
    exportObject[chain] = { fetch }
    exportObjectV1[chain] = {
      fetch: async (_: any, _1: any, options: FetchOptions) => fetch(options),
      start: chainConfig.start,
    }
  })


  if (runAsV1)
    return { adapter: exportObjectV1, version: 1 } as SimpleAdapter


  return { adapter: exportObject, version: 2 } as SimpleAdapter
}

export function uniV3Exports(config: IJSON<UniV3Config>, { runAsV1 = false } = {}) {
  const exportObject: BaseAdapter = {}
  const exportObjectV1: BaseAdapter = {}


  Object.entries(config).map(([chain, chainConfig]) => {
    const fetch: any = getUniV3LogAdapter(chainConfig)
    exportObject[chain] = { fetch }
    exportObjectV1[chain] = {
      fetch: async (_: any, _1: any, options: FetchOptions) => fetch(options),
      start: chainConfig.start,
    }
  })

  if (runAsV1)
    return { adapter: exportObjectV1, version: 1 } as SimpleAdapter


  return { adapter: exportObject, version: 2 } as SimpleAdapter
}


export async function filterPools2({ fetchOptions, pairs, token0s, token1s, minUSDValue, maxPairSize }: any) {
  const pairObject: IJSON<string[]> = {}
  pairs.forEach((pair: string, i: number) => {
    pairObject[pair] = [token0s[i], token1s[i]]
  })
  const res = await filterPools({ ...fetchOptions, pairs: pairObject, minUSDValue, maxPairSize })
  pairs = []
  token0s = []
  token1s = []
  Object.keys(res).forEach((pair: any) => {
    pairs.push(pair)
    const [token0, token1] = pairObject[pair]
    token0s.push(token0)
    token1s.push(token1)
  })
  return { pairs, token0s, token1s, pairObject, }
}