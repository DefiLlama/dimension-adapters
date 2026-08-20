import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { isCoreAsset } from '../../helpers/prices'
import { filterPools } from '../../helpers/uniswap'
import { httpGet } from '../../utils/fetchURL'

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

async function getHistoricalPriceableTokens(chain: string, tokens: string[], timestamp: number) {
  const priceable = new Set<string>()
  const unknown = new Set<string>()
  for (const token of tokens.map((token) => token.toLowerCase())) {
    if (isCoreAsset(chain, token)) priceable.add(token)
    else unknown.add(token)
  }

  const pending = [...unknown]
  for (let i = 0; i < pending.length; i += 100) {
    const keys = pending
      .slice(i, i + 100)
      .map((token) => `${chain}:${token}`)
      .join(',')
    const { coins } = await httpGet(
      `https://coins.llama.fi/prices/historical/${timestamp}/${keys}?searchWidth=6h`,
    )
    for (const [key, info] of Object.entries(coins ?? {}) as [string, any][]) {
      if ((info?.confidence ?? 0) >= 0.9) priceable.add(key.split(':')[1].toLowerCase())
    }
  }
  return priceable
}

export function selectVolumeSide(chain: string, token0: string, token1: string, establishedTokens: Set<string>) {
  const token0IsPriceable = establishedTokens.has(token0.toLowerCase())
  const token1IsPriceable = establishedTokens.has(token1.toLowerCase())
  if (!token0IsPriceable && !token1IsPriceable)
    throw new Error(`SwitchX pool tokens ${token0}/${token1} have no priceable side`)

  // Preserve the repository's normal core-asset preference when both sides
  // are priceable, but use token0 when it is the only priceable side.
  const useToken0 = token0IsPriceable && (!token1IsPriceable || isCoreAsset(chain, token0))
  return { token: useToken0 ? token0 : token1, tokenIndex: useToken0 ? (0 as const) : (1 as const) }
}

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

  // Pool creation is permissionless, so require at least one side that the
  // DefiLlama price system recognizes as a core or high-confidence asset.
  // This also makes the selected volume side explicit instead of relying on
  // addOneToken's static token1 fallback for non-core token0 assets.
  // Use the measured window's prices so later listing/coverage changes cannot
  // alter which side is selected when replaying historical volume.
  const establishedTokens = await getHistoricalPriceableTokens(
    options.chain,
    Object.values(pairs).flat(),
    options.endTimestamp - 1,
  )
  const priceablePairs = Object.fromEntries(
    Object.entries(pairs).filter(([, tokens]) => tokens.some((token) => establishedTokens.has(token.toLowerCase()))),
  )
  if (!Object.keys(priceablePairs).length) return { dailyVolume }

  // Exclude economically empty pools before fetching swaps. The high cap
  // prevents the helper's default top-pool truncation from omitting legitimate
  // permissionless SwitchX markets as the factory grows.
  const filteredPairs = await filterPools({
    api: options.api,
    pairs: priceablePairs,
    createBalances: options.createBalances,
    minUSDValue: MIN_POOL_LIQUIDITY_USD,
    // Do not truncate permissionless markets. options.getLogs handles
    // multi-target retrieval with bounded concurrency when RPC fallback is used.
    maxPairSize: Number.POSITIVE_INFINITY,
  })
  const pools = Object.keys(filteredPairs)
  if (!pools.length) return { dailyVolume }

  const volumeSideByPool: Record<string, { token: string; tokenIndex: 0 | 1 }> = {}
  for (const pool of pools) {
    const [token0, token1] = pairs[pool]
    volumeSideByPool[pool] = selectVolumeSide(options.chain, token0, token1, establishedTokens)
  }

  const swapLogs = await options.getLogs({ targets: pools, eventAbi: SWAP, flatten: false })

  swapLogs.forEach((logs: any[], poolIndex: number) => {
    const pool = pools[poolIndex]
    const { token, tokenIndex } = volumeSideByPool[pool]
    logs.forEach((swap: any) => {
      const amount = BigInt(tokenIndex === 0 ? swap.amount0 : swap.amount1)
      dailyVolume.add(token, amount < 0n ? -amount : amount)
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
      "Sum one explicitly priceable token side from every on-chain Swap event in economically active standard and custom pools created by the canonical SwitchX factory on PulseChain, so each trade is counted once. Pools without a PulseChain core asset or a high-confidence DefiLlama-priced side for the measured window are excluded.",
  },
}

export default adapter
