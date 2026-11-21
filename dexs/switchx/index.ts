import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { addOneToken } from '../../helpers/prices'
import { filterPools } from '../../helpers/uniswap'

// Canonical SwitchX V4Factory deployment on PulseChain:
// https://scan.pulsechain.com/address/0xeF72cbCcF4A807DfA1fbecd61DdB488fF8a05fa3
const FACTORY = '0xeF72cbCcF4A807DfA1fbecd61DdB488fF8a05fa3'
// Production launch block containing the first canonical factory activity:
// https://scan.pulsechain.com/block/26521466
const FACTORY_FROM_BLOCK = 26521466
// Ignore economically empty/spam pools while retaining small live markets.
const MIN_POOL_LIQUIDITY_USD = 200

const STANDARD_POOL_CREATED = 'event Pool(address indexed token0, address indexed token1, address pool)'
const CUSTOM_POOL_CREATED = 'event CustomPool(address indexed deployer, address indexed token0, address indexed token1, address pool)'
const SWAP =
  'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 price, uint128 liquidity, int24 tick)'

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()

  const [standardPoolLogs, customPoolLogs] = await Promise.all([
    options.getLogs({
      target: FACTORY,
      fromBlock: FACTORY_FROM_BLOCK,
      eventAbi: STANDARD_POOL_CREATED,
      cacheInCloud: true,
    }),
    options.getLogs({
      target: FACTORY,
      fromBlock: FACTORY_FROM_BLOCK,
      eventAbi: CUSTOM_POOL_CREATED,
      cacheInCloud: true,
    }),
  ])

  const pairs: Record<string, string[]> = {}
  for (const { token0, token1, pool } of [...standardPoolLogs, ...customPoolLogs]) {
    pairs[pool.toLowerCase()] = [token0, token1]
  }

  // Exclude economically empty pools before fetching swaps. The high cap
  // prevents the helper's default top-pool truncation from omitting legitimate
  // permissionless SwitchX markets as the factory grows.
  const filteredPairs = await filterPools({
    api: options.api,
    pairs,
    createBalances: options.createBalances,
    minUSDValue: MIN_POOL_LIQUIDITY_USD,
    // Do not truncate permissionless markets. options.getLogs handles
    // multi-target retrieval with bounded concurrency when RPC fallback is used.
    maxPairSize: Number.POSITIVE_INFINITY,
  })
  const pools = Object.keys(filteredPairs)
  if (!pools.length) return { dailyVolume }

  const swapLogs = await options.getLogs({ targets: pools, eventAbi: SWAP, flatten: false })

  swapLogs.forEach((logs: any[], poolIndex: number) => {
    const [token0, token1] = pairs[pools[poolIndex]]
    logs.forEach((swap: any) => {
      addOneToken({
        chain: options.chain,
        balances: dailyVolume,
        token0,
        token1,
        amount0: swap.amount0,
        amount1: swap.amount1,
      })
    })
  })

  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.PULSECHAIN],
  start: '2026-05-13',
  fetch,
  methodology: {
    Volume:
      "Sum one token side from every on-chain Swap event in economically active standard and custom pools created by the canonical SwitchX factory on PulseChain, preferring a core asset when the pool has one so each trade is counted once.",
  },
}

export default adapter
