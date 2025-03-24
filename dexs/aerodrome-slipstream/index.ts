import * as sdk from '@defillama/sdk';
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from '../../helpers/prices';
import { filterPools2 } from "../../helpers/uniswap";

const CONFIG = {
  factory: '0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A'
}

const topics = {
  event_poolCreated: '0xab0d57f0df537bb25e80245ef7748fa62353808c54d6e528a9dd20887aed9ac2',
  event_swap: '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67'
}

const eventAbis = {
  event_swap: 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)'
}

type PoolInfo = {
  pair: string
  token0: string
  token1: string
  factory: string
  createdAtBlock: number
}

const fetch = async (_:any, _1:any, fetchOptions: FetchOptions): Promise<FetchResult> => {
  const { api, createBalances, getToBlock, getFromBlock, chain } = fetchOptions
  const dailyVolume = createBalances()
  const dailyFees = createBalances()
  const [toBlockRaw, fromBlock] = await Promise.all([getToBlock(),getFromBlock()])
  const toBlock = toBlockRaw - 15

  const rawPools = await sdk.indexer.getLogs({ chain, target: CONFIG.factory, fromBlock: 13843704, toBlock, topics: [topics.event_poolCreated] }) 
  
  const poolInfoMap = new Map<string, PoolInfo>()
  rawPools.forEach(({ source, topics, data, blockNumber }) => {
    if (!topics || topics.length < 4 || data.length < 66) return
  
    const rawToken0 = topics[1]
    const rawToken1 = topics[2]
    if (!rawToken0 || !rawToken1) return
  
    const pair = `0x${data.slice(26, 66)}`.toLowerCase()
    const token0 = `0x${rawToken0.slice(26)}`.toLowerCase()
    const token1 = `0x${rawToken1.slice(26)}`.toLowerCase()
    const factory = source.toLowerCase()
    poolInfoMap.set(pair, { pair, token0, token1, factory, createdAtBlock: blockNumber })
  })

  const poolInfos = Array.from(poolInfoMap.values())
  const res = await filterPools2({
    fetchOptions,
    pairs: poolInfos.map(p => p.pair),
    token0s: poolInfos.map(p => p.token0),
    token1s: poolInfos.map(p => p.token1),
    minUSDValue: 2000,
    maxPairSize: 1000
  })

  const pools: PoolInfo[] = res.pairs.map((pair: string) => poolInfoMap.get(pair)!).filter(Boolean)
  const feesRaw = await api.multiCall({ abi: 'uint256:fee', calls: pools.map((p) => ({ target: p.pair })) })

  const feesMap = new Map<string, number>()
  pools.forEach((pool, i) => {
    feesMap.set(pool.pair, +feesRaw[i] / 1e6)
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
    const logs = logsMap.get(pool.pair) ?? []
    const { token0, token1, pair } = pool
    const fee = feesMap.get(pair) ?? 0

    logs.forEach((log: any) => {
      const amount0 = Number(log[2])
      const amount1 = Number(log[3])
      const fee0 = amount0 * fee
      const fee1 = amount1 * fee

      addOneToken({ chain, balances: dailyVolume, token0, token1, amount0, amount1 })
      addOneToken({ chain, balances: dailyFees, token0, token1, amount0: fee0, amount1: fee1 })
    })
  }

  return { dailyVolume, dailyFees, dailyRevenue: dailyFees, dailyHoldersRevenue: dailyFees } as any
}

const adapters: SimpleAdapter = {
  version: 1,
  isExpensiveAdapter: true,
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetch as any,
      start: '2024-05-03',
    }
  }
}
export default adapters;
