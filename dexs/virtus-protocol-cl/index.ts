import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from '../../helpers/prices';

const CONFIG = {
  CLFactory: '0x0e5Ab24beBdA7e5Bb3961f7E9b3532a83aE86B48',
  fromBlock: 42960000,
}

const swapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)'
const poolCreatedEvent = 'event PoolCreated(address indexed token0, address indexed token1, int24 indexed tickSpacing, address pool)'

const fetch = async (fetchOptions: FetchOptions): Promise<FetchResult> => {
  const { api, createBalances, chain, getLogs } = fetchOptions
  const dailyVolume = createBalances()
  const dailyFees = createBalances()

  const rawPools = await getLogs({
    target: CONFIG.CLFactory,
    fromBlock: CONFIG.fromBlock,
    eventAbi: poolCreatedEvent,
    cacheInCloud: true,
    skipIndexer: true,
  })

  if (!rawPools?.length) return { dailyVolume, dailyFees }

  const pools = rawPools.map((i: any) => i.pool.toLowerCase())
  const fees = await api.multiCall({ abi: 'uint256:fee', calls: pools, permitFailure: true })

  const poolTokens: Record<string, [string, string]> = {}
  const poolFees: Record<string, number> = {}
  const validPools: string[] = []

  rawPools.forEach(({ token0, token1, pool }: any, index: number) => {
    const p = pool.toLowerCase()
    const rawFee = fees[index]
    if (rawFee === null || rawFee === undefined) return;
    poolTokens[p] = [token0, token1]
    poolFees[p] = rawFee / 1e6
    validPools.push(p)
  })

  if (!validPools.length) return { dailyVolume, dailyFees }

  const allLogs = await getLogs({ targets: validPools, eventAbi: swapEvent, flatten: false })

  allLogs.forEach((logs: any, index: number) => {
    if (!logs?.length) return;
    const pool = validPools[index]
    const [token0, token1] = poolTokens[pool]
    const fee = poolFees[pool]
    logs.forEach((log: any) => {
      const amount0 = Number(log.amount0)
      const amount1 = Number(log.amount1)
      addOneToken({ chain, balances: dailyVolume, token0, token1, amount0, amount1 })
      addOneToken({ chain, balances: dailyFees, token0, token1, amount0: amount0 * fee, amount1: amount1 * fee })
    })
  })

  return { dailyVolume, dailyFees, dailyRevenue: dailyFees, dailyHoldersRevenue: dailyFees }
}

const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetch as any,
      start: '2026-03-05',
    }
  }
}

export default adapters
