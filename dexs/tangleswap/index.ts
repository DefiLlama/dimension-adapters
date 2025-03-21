import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

import { cache } from "@defillama/sdk";
import { filterPools } from "../../helpers/uniswap";
import { addOneToken } from "../../helpers/prices";

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.SHIMMER_EVM]: {
      fetch,
      start: '2023-10-04',
    },
  },
};

export default adapter;

const swapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)'

async function fetch({ createBalances, getLogs, api, chain }: FetchOptions) {
  const cacheKey = 'tvl-adapter-cache/cache/config-cache/tangleswap/shimmer_evm.json'

  const res = await cache.readCache(cacheKey, { readFromR2Cache: true })
  const pools = res.map(i => i.id)
  const _fees = await api.multiCall({ abi: 'function fees() view returns (uint24)', calls: pools, permitFailure: true, })

  const pairObject: any = {}
  const fees: any = {}
  res.forEach((log: any, idx: any) => {
    pairObject[log.id] = [log.token0.id, log.token1.id]
    fees[log.pool] = (_fees[idx] || 0) / 1e6 // seem some protocol v3 forks does not have fee in the log when not use defaultPoolCreatedEvent
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