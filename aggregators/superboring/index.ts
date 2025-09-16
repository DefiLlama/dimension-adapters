import { request, gql } from 'graphql-request'
import { CHAIN } from '../../helpers/chains'
import { FetchOptions, SimpleAdapter } from '../../adapters/types'

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

async function fetchLiquidityMovedAmount(
  torexAddress: string,
  options: FetchOptions
): Promise<bigint> {
  try {
    const logs = await options.getLogs({
      target: torexAddress,
      eventAbi: LIQUIDITY_MOVED_EVENT
    })
    
    let totalInAmount = 0n
    
    for (const log of logs) {
      const inAmount = BigInt(log.inAmount || '0')
      totalInAmount += inAmount
    }
    
    return totalInAmount
  } catch (e) {
    console.warn(`Failed to fetch LiquidityMoved events for torex ${torexAddress}:`, e)
    return 0n
  }
}

async function getSuperTokenMetadata(superTokenAddress: string, options: FetchOptions): Promise<{
  underlyingToken: string | null,
  underlyingDecimals: number,
  isNativeAssetSuperToken: boolean
}> {
  try {
    let underlyingToken: string | null = null
    let underlyingDecimals = 18 // Default for SuperTokens
    let isNativeAssetSuperToken = false
    
    try {
      underlyingToken = await options.api.call({
        target: superTokenAddress,
        abi: SUPERTOKEN_ABI.getUnderlyingToken
      })
      
      if (underlyingToken === ZERO_ADDRESS) {
        isNativeAssetSuperToken = true
        underlyingToken = null
      } else {
        underlyingDecimals = await options.api.call({
          target: superTokenAddress,
          abi: SUPERTOKEN_ABI.getUnderlyingDecimals
        })
      }
    } catch (e) {
      underlyingToken = null
    }
    
    return {
      underlyingToken,
      underlyingDecimals: Number(underlyingDecimals),
      isNativeAssetSuperToken
    }
  } catch (e) {
    console.warn(`Failed to get SuperToken metadata for ${superTokenAddress}:`, e)
    return {
      underlyingToken: null,
      underlyingDecimals: 18,
      isNativeAssetSuperToken: false
    }
  }
}

async function fetchDailyVolume(options: FetchOptions) {
  const { chain } = options
  const torexes = await fetchTorexes(chain)
  const dailyVolumeBalances = options.createBalances()
  
  if (!torexes.length) {
    return { dailyVolume: dailyVolumeBalances }
  }

  for (const torex of torexes) {
    const amount = await fetchLiquidityMovedAmount(torex.address, options)
    if (amount === 0n) continue
    
    const tokenMetadata = await getSuperTokenMetadata(torex.inTokenAddress, options)
    
    if (tokenMetadata.isNativeAssetSuperToken) {
      // Native SuperToken (ETHx) - use zero address for native token pricing
      dailyVolumeBalances.add(ZERO_ADDRESS, amount.toString())
    } else if (!tokenMetadata.underlyingToken) {
      // Pure SuperToken (no underlying) - use SuperToken address itself
      dailyVolumeBalances.add(torex.inTokenAddress.toLowerCase(), amount.toString())
    } else {
      // Wrapped SuperToken - use underlying token address
      const underlyingDecimals = tokenMetadata.underlyingDecimals
      // SuperTokens have 18 decimals, but underlying tokens may have different decimals for tokens like USDC, so scaling down here if necessary
      const scaled = amount / (10n ** BigInt(18 - underlyingDecimals))
      if (scaled > 0n) {
        dailyVolumeBalances.add(tokenMetadata.underlyingToken.toLowerCase(), scaled.toString())
      }
    }
  }

  return { dailyVolume: dailyVolumeBalances }
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch: fetchDailyVolume,
  chains: [CHAIN.BASE, CHAIN.OPTIMISM, CHAIN.ARBITRUM],
  adapter: {
    [CHAIN.BASE]: { start: 1720080031 },
    [CHAIN.OPTIMISM]: { start: 1723454131 },
    [CHAIN.ARBITRUM]: { start: 1750045591 },
  },
  methodology: 'Volume represents the USD value of SuperTokens DCAed through SuperBoring Torexes during each day',
}

export default adapter
