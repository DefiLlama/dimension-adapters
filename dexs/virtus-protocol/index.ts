import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from '../../helpers/prices';

const CONFIG = {
  PoolFactory: '0x7F03ae4452192b0E280fB0d4f9c225DDa88C7623',
}

const swapEvent = 'event Swap(address indexed sender, address indexed to, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out)'

const factoryAbis = {
  allPoolsLength: 'uint256:allPoolsLength',
  allPools: 'function allPools(uint256) external view returns (address)',
  getFee: 'function getFee(address pool, bool _stable) external view returns (uint256)',
}

const fetch = async (fetchOptions: FetchOptions): Promise<FetchResult> => {
  const { createBalances, api, chain, getLogs } = fetchOptions
  const dailyVolume = createBalances()
  const dailyFees = createBalances()

  const poolCount = await api.call({ target: CONFIG.PoolFactory, abi: factoryAbis.allPoolsLength })
  if (!poolCount || Number(poolCount) === 0) return { dailyVolume, dailyFees }

  const calls = []
  for (let i = 0; i < Number(poolCount); i++) {
    calls.push({ target: CONFIG.PoolFactory, params: [i] })
  }
  const pools: string[] = await api.multiCall({ abi: factoryAbis.allPools, calls })
  const token0s: string[] = await api.multiCall({ abi: 'address:token0', calls: pools })
  const token1s: string[] = await api.multiCall({ abi: 'address:token1', calls: pools })
  const stables: boolean[] = await api.multiCall({ abi: 'bool:stable', calls: pools, permitFailure: true })

  const fees = await api.multiCall({
    abi: factoryAbis.getFee,
    target: CONFIG.PoolFactory,
    calls: pools.map((pool, i) => ({ params: [pool, stables[i] ?? false] })),
    permitFailure: true,
  })

  const poolTokens: Record<string, [string, string]> = {}
  const poolFees: Record<string, number> = {}
  pools.forEach((pool, index) => {
    const p = pool.toLowerCase()
    poolTokens[p] = [token0s[index], token1s[index]]
    poolFees[p] = (fees[index] ?? 30) / 1e4
  })

  const targets = pools.map(p => p.toLowerCase())
  const allLogs = await getLogs({ targets, eventAbi: swapEvent, flatten: false })

  allLogs.forEach((logs: any, index: number) => {
    if (!logs?.length) return;
    const pool = targets[index]
    const [token0, token1] = poolTokens[pool]
    const fee = poolFees[pool]
    logs.forEach((log: any) => {
      const amount0 = Number(log.amount0In) + Number(log.amount0Out)
      const amount1 = Number(log.amount1In) + Number(log.amount1Out)
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
