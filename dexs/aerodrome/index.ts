import * as sdk from '@defillama/sdk';
import { Fetch, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from '../../helpers/prices';
import { filterPools2 } from "../../helpers/uniswap";

const CONFIG = {
  factoryRegistry: '0x5C3F18F06CC09CA1910767A34a20F771039E37C0',
  voter: '0x16613524e02ad97eDfeF371bC883F2F5d6C480A5'
}

const abis = {
  poolFactories: 'function poolFactories() view returns (address[])',
  fees: 'function getFee(address pool, bool _stable) external view returns (uint256)'
}

const topics = {
  event_poolCreated: '0x2128d88d14c80cb081c1252a5acff7a264671bf199ce226b53788fb26065005e',
  event_swap: '0xb3e2773606abfd36b5bd91394b3a54d1398336c65005baf7bf7a05efeffaf75b',
  event_notify_reward: '0x52977ea98a2220a03ee9ba5cb003ada08d394ea10155483c95dc2dc77a7eb24b'
}

const eventAbis = {
  event_poolCreated: 'event PoolCreated(address indexed token0, address indexed token1, int24 indexed tickSpacing, address pool)',
  event_swap: 'event Swap(address indexed sender, address indexed to, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out)',
  event_notify_reward: 'event NotifyReward(address indexed from,address indexed reward,uint256 indexed epoch,uint256 amount)',
  event_gauge_created: 'event GaugeCreated(address indexed poolFactory,address indexed votingRewardsFactory,address indexed gaugeFactory,address pool,address bribeVotingReward,address feeVotingReward,address gauge,address creator)'
}

type PoolInfo = {
  pair: string
  token0: string
  token1: string
  stable: number
  factory: string
  createdAtBlock: number
}

const getBribes = async (fromBlock: number, toBlock: number, options: FetchOptions): Promise<{ dailyBribesRevenue: sdk.Balances }> => {
  const { createBalances, chain } = options
  const dailyBribesRevenue = createBalances()
  const logs_gauge_created = await sdk.indexer.getLogs({ chain, target: CONFIG.voter, fromBlock: 3200601, toBlock, eventAbi: eventAbis.event_gauge_created, cacheInCloud: true })
  const bribes_contract: string[] = logs_gauge_created.map((log) => log[4].toLowerCase())
  const logs = await sdk.indexer.getLogs({ chain, targets: bribes_contract, fromBlock, toBlock, topics:[topics.event_notify_reward] })
  logs.forEach(([_, reward, amount]) => {
    dailyBribesRevenue.add(reward, amount)
  })

  return { dailyBribesRevenue }
}

const getVolumeAndFees = async (fromBlock: number, toBlock: number, options: FetchOptions): Promise<{ dailyVolume: sdk.Balances; dailyFees: sdk.Balances }> => {
  const { createBalances, api, chain } = options
  const dailyVolume = createBalances()
  const dailyFees = createBalances()

  const factories = await api.call({ abi: abis.poolFactories, target: CONFIG.factoryRegistry })
  const rawPools = await sdk.indexer.getLogs({ chain, targets: factories, fromBlock: 3200668, toBlock, topics: [topics.event_poolCreated] })

  const poolInfoMap = new Map<string, PoolInfo>()
  rawPools.forEach(({ source, topics, data, blockNumber  }) => {
    if (!topics || topics.length < 4 || data.length < 66) return
  
    const rawToken0 = topics[1]
    const rawToken1 = topics[2]
    const rawStable = topics[3]
    if (!rawToken0 || !rawToken1 || !rawStable) return
  
    const pair = `0x${data.slice(26, 66)}`.toLowerCase()
    const token0 = `0x${rawToken0.slice(26)}`.toLowerCase()
    const token1 = `0x${rawToken1.slice(26)}`.toLowerCase()
    const stable = rawStable === '0x0000000000000000000000000000000000000000000000000000000000000001' ? 1 : 0
    const factory = source.toLowerCase()
    poolInfoMap.set(pair, { pair, token0, token1, stable, factory, createdAtBlock: blockNumber })
  })

  const poolInfos = Array.from(poolInfoMap.values())
  const res = await filterPools2({
    fetchOptions: options,
    pairs: poolInfos.map(p => p.pair),
    token0s: poolInfos.map(p => p.token0),
    token1s: poolInfos.map(p => p.token1),
    minUSDValue: 10000,
    maxPairSize: 1200
  })

  const pools: PoolInfo[] = res.pairs.map((pair: string) => poolInfoMap.get(pair)!).filter(Boolean)
  const feesRaw = await api.multiCall({ abi: abis.fees, calls: pools.map(p => ({ target: p.factory, params: [p.pair, p.stable] })) })

  const feesMap = new Map<string, number>()
  pools.forEach((pool, i) => {
    feesMap.set(pool.pair, +feesRaw[i] / 1e4)
  })

  const chunkSize = 10
  const logsMap = new Map<string, any[]>()
  
  for (let i = 0; i < pools.length; i += chunkSize) {
    const chunkPools = pools.slice(i, i + chunkSize)
    const chunkTargets = chunkPools.map(p => p.pair)
  
    const currentLogs = await sdk.indexer.getLogs({
      chain,
      targets: chunkTargets,
      topics: [topics.event_swap],
      eventAbi: eventAbis.event_swap,
      flatten: false,
      fromBlock,
      toBlock,
    })
  
    currentLogs.forEach((logsForPair, j) => {
      const pair = chunkTargets[j]
      logsMap.set(pair, logsForPair)
    })
  }

  for (const pool of pools) {
    const { pair, token0, token1 } = pool
    const fee = feesMap.get(pair) ?? 0
    const logs = logsMap.get(pair) ?? []
  
    for (const log of logs) {
      let amount0 = log.amount0In
      let amount1 = log.amount1Out
  
      if (Number(amount0) === 0) {
        amount0 = log.amount0Out
        amount1 = log.amount1In
      }
  
      const fee0 = Number(amount0) * fee
      const fee1 = Number(amount1) * fee
  
      addOneToken({ chain, balances: dailyVolume, token0, token1, amount0, amount1 })
      addOneToken({ chain, balances: dailyFees, token0, token1, amount0: fee0, amount1: fee1 })
    }
  }

  return { dailyVolume, dailyFees }
}

const fetch: Fetch = async (_t: any, _a: any, options: FetchOptions): Promise<FetchResult> => {
  const { getToBlock, getFromBlock } = options
  const [toBlockRaw, fromBlock] = await Promise.all([getToBlock(),getFromBlock()])
  const toBlock = toBlockRaw - 15

  const [{ dailyVolume, dailyFees }, { dailyBribesRevenue }] = await Promise.all([
    getVolumeAndFees(fromBlock, toBlock, options),
    getBribes(fromBlock, toBlock, options)
  ])

  return { dailyVolume, dailyFees, dailyRevenue: dailyFees, dailyHoldersRevenue: dailyFees, dailyBribesRevenue }
}

const adapters: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: '2023-08-28',
    }
  }
}
export default adapters;