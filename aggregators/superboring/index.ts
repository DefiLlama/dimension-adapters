import { request, gql } from 'graphql-request'
import { CHAIN } from '../../helpers/chains'
import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { getConfig } from '../../helpers/cache'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

// Subgraph endpoints for fetching torex contract addresses
const TOREX_GRAPHQL_ENDPOINTS: Record<string, string> = {
  [CHAIN.BASE]: 'https://api.goldsky.com/api/public/project_clsnd6xsoma5j012qepvucfpp/subgraphs/superboring_base-mainnet/prod/gn',
  [CHAIN.OPTIMISM]: 'https://api.goldsky.com/api/public/project_clsnd6xsoma5j012qepvucfpp/subgraphs/superboring_optimism-mainnet/prod/gn',
  [CHAIN.ARBITRUM]: 'https://api.goldsky.com/api/public/project_clsnd6xsoma5j012qepvucfpp/subgraphs/superboring_arbitrum-one/prod/gn',
}

// GraphQL query to fetch torex contracts and their input tokens
const TOREXES_QUERY = gql`
  query Torexes {
    torexes {
      id
      name
      inToken {
        id
        underlyingTokenAddress
      }
    }
  }
`

const LIQUIDITY_MOVED_EVENT = 'event LiquidityMoved(address indexed liquidityMover, uint256 durationSinceLastLME, uint256 twapSinceLastLME, uint256 inAmount, uint256 minOutAmount, uint256 outAmount, uint256 actualOutAmount)'

const SUPERTOKEN_ABI = {
  getUnderlyingToken: 'function getUnderlyingToken() view returns (address)',
  getUnderlyingDecimals: 'function getUnderlyingDecimals() view returns (uint8)',
  decimals: 'function decimals() view returns (uint8)',
}


type TorexData = {
  address: string
  inTokenAddress: string
}

async function fetchTorexes(chain: string): Promise<TorexData[]> {
  const endpoint = TOREX_GRAPHQL_ENDPOINTS[chain]
  if (!endpoint) return []
  
  try {
    const res = await request<{ torexes: any[] }>(endpoint, TOREXES_QUERY)
    return (res.torexes || [])
      .filter(t => t?.id && t?.inToken?.id)
      .map(t => ({
        address: t.id,
        inTokenAddress: t.inToken.id
      }))
  } catch (e) {
    console.warn(`Failed to fetch torexes from subgraph for chain ${chain}:`, e)
    return []
  }
}

const NATIVE_ASSET_ADDRESSES: Record<string, string> = {
  [CHAIN.BASE]: '0x46fd5cfb4c12d87acd3a13e92baa53240c661d93',
  [CHAIN.OPTIMISM]: '0x4ac8bd1bdae47beef2d1c6aa62229509b962aa0d',
  [CHAIN.ARBITRUM]: '0xe6c8d111337d0052b9d88bf5d7d55b7f8385acd3'
}

async function fetchDailyVolume(options: FetchOptions) {
  const { chain } = options
  const torexes: TorexData[] = await getConfig(`superboring-torexes/${chain}`, '', {
    fetcher: () => fetchTorexes(chain),
  })
  const dailyVolumeBalances = options.createBalances()

  if (!torexes.length) {
    return { dailyVolume: dailyVolumeBalances }
  }

  // Pull LiquidityMoved logs for every torex in a single batched call (one array per torex).
  const logsPerTorex: any[][] = await options.getLogs({
    targets: torexes.map(t => t.address),
    eventAbi: LIQUIDITY_MOVED_EVENT,
    flatten: false,
  })

  // Sum inAmount per torex; keep only the torexes that actually moved liquidity.
  const activeTorexes = torexes
    .map((torex, i) => {
      let totalInAmount = 0n
      for (const log of logsPerTorex[i] || []) totalInAmount += BigInt(log.inAmount || '0')
      return { torex, amount: totalInAmount }
    })
    .filter(t => t.amount > 0n)

  if (!activeTorexes.length) {
    return { dailyVolume: dailyVolumeBalances }
  }

  // Resolve SuperToken metadata for all active in-tokens in two batched multiCalls.
  const inTokens = activeTorexes.map(t => t.torex.inTokenAddress)
  const underlyingTokens: (string | null)[] = await options.api.multiCall({
    abi: SUPERTOKEN_ABI.getUnderlyingToken,
    calls: inTokens,
    permitFailure: true,
  })

  // getUnderlyingDecimals only matters for wrapped SuperTokens (non-zero underlying).
  const wrappedIndexes = underlyingTokens
    .map((u, i) => ({ u, i }))
    .filter(({ u }) => !!u && u !== ZERO_ADDRESS)
  const wrappedDecimals: any[] = await options.api.multiCall({
    abi: SUPERTOKEN_ABI.getUnderlyingDecimals,
    calls: wrappedIndexes.map(({ i }) => inTokens[i]),
    permitFailure: true,
  })
  const decimalsByIndex: Record<number, number> = {}
  wrappedIndexes.forEach(({ i }, k) => {
    decimalsByIndex[i] = Number(wrappedDecimals[k] ?? 18)
  })

  const nativeAsset = (NATIVE_ASSET_ADDRESSES[chain] || '').toLowerCase()

  activeTorexes.forEach(({ torex, amount }, i) => {
    const underlying = underlyingTokens[i]

    if (!underlying || underlying === ZERO_ADDRESS) {
      if (torex.inTokenAddress.toLowerCase() === nativeAsset) {
        // Native SuperToken (ETHx) - use zero address for native token pricing
        dailyVolumeBalances.add(ZERO_ADDRESS, amount.toString())
      } else {
        // Pure SuperToken (no underlying) - use SuperToken address itself
        dailyVolumeBalances.add(torex.inTokenAddress.toLowerCase(), amount.toString())
      }
    } else {
      // Wrapped SuperToken - use underlying token address
      // SuperTokens have 18 decimals, but underlying tokens may have different decimals for tokens like USDC, so scaling down here if necessary
      const scaled = amount / (10n ** BigInt(18 - decimalsByIndex[i]))
      if (scaled > 0n) {
        dailyVolumeBalances.add(underlying.toLowerCase(), scaled.toString())
      }
    }
  })

  return { dailyVolume: dailyVolumeBalances }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch: fetchDailyVolume,
  adapter: {
    [CHAIN.BASE]: { start: 1720080031 },
    [CHAIN.OPTIMISM]: { start: 1723454131 },
    [CHAIN.ARBITRUM]: { start: 1750045591 },
  },
  methodology: 'Volume represents the USD value of SuperTokens DCAed through SuperBoring Torexes during each day',
}

export default adapter
