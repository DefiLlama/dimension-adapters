import { request, gql } from 'graphql-request'
import { Balances } from '@defillama/sdk'
import { CHAIN } from '../../helpers/chains'
import { FetchOptions, SimpleAdapter } from '../../adapters/types'

type Torex = {
  id: string
  name: string
  inToken: {
    id: string
    underlyingTokenAddress: string | null
  }
}

const TOREX_GRAPHQL_ENDPOINTS: Record<string, string> = {
  [CHAIN.BASE]: 'https://api.goldsky.com/api/public/project_clsnd6xsoma5j012qepvucfpp/subgraphs/superboring_base-mainnet/prod/gn',
  [CHAIN.OPTIMISM]: 'https://api.goldsky.com/api/public/project_clsnd6xsoma5j012qepvucfpp/subgraphs/superboring_optimism-mainnet/prod/gn',
  [CHAIN.ARBITRUM]: 'https://api.goldsky.com/api/public/project_clsnd6xsoma5j012qepvucfpp/subgraphs/superboring_arbitrum-one/prod/gn',
}

const SUPERFLUID_PROTOCOL_SUBGRAPH: Record<string, string> = {
  [CHAIN.BASE]: 'https://subgraph-endpoints.superfluid.dev/base-mainnet/protocol-v1',
  [CHAIN.OPTIMISM]: 'https://subgraph-endpoints.superfluid.dev/optimism-mainnet/protocol-v1',
  [CHAIN.ARBITRUM]: 'https://subgraph-endpoints.superfluid.dev/arbitrum-one/protocol-v1',
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

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

const STREAM_PERIODS_QUERY = gql`
  query StreamPeriods($receiver: String!, $token: String!, $start: BigInt!, $end: BigInt!, $skip: Int!) {
    streamPeriods(
      first: 1000
      skip: $skip
      where: { receiver: $receiver, token: $token, startedAtTimestamp_lt: $end }
      orderBy: startedAtTimestamp
      orderDirection: asc
    ) {
      flowRate
      startedAtTimestamp
      stoppedAtTimestamp
    }
  }
`

const TOKENS_QUERY = gql`
  query Tokens($ids: [String!]) {
    tokens(where: { id_in: $ids }) {
      id
      decimals
      isNativeAssetSuperToken
      underlyingAddress
      underlyingToken { id decimals }
    }
  }
`


async function fetchTorexes(chain: string): Promise<Torex[]> {
  const endpoint = TOREX_GRAPHQL_ENDPOINTS[chain]
  if (!endpoint) return []
  const res = await request<{ torexes: Torex[] }>(endpoint, TOREXES_QUERY)
  return (res.torexes || []).filter(t => t?.inToken?.id)
}

async function fetchAllStreamedAmountIntoReceiver(
  receiver: string,
  superToken: string,
  startTimestamp: number,
  endTimestamp: number,
  chain: string
): Promise<bigint> {
  const endpoint = SUPERFLUID_PROTOCOL_SUBGRAPH[chain]
  let skip = 0
  let totalAmount = 0n
  
  while (true) {
    const { streamPeriods } = await request<{ streamPeriods: any[] }>(
      endpoint,
      STREAM_PERIODS_QUERY,
      {
        receiver: receiver.toLowerCase(),
        token: superToken.toLowerCase(),
        start: startTimestamp.toString(),
        end: endTimestamp.toString(),
        skip
      }
    )
    
    if (!streamPeriods || streamPeriods.length === 0) break
    
    for (const period of streamPeriods) {
      const flowRate = BigInt(period.flowRate || '0')
      if (flowRate === 0n) continue
      
      const periodStart = Math.max(Number(period.startedAtTimestamp), startTimestamp)
      const periodEnd = period.stoppedAtTimestamp 
        ? Math.min(Number(period.stoppedAtTimestamp), endTimestamp)
        : endTimestamp
      
      if (periodStart < periodEnd) {
        const duration = BigInt(periodEnd - periodStart)
        totalAmount += flowRate * duration
      }
    }
    
    if (streamPeriods.length < 1000) break
    skip += 1000
  }
  
  return totalAmount
}

async function fetchDailyVolume(options: FetchOptions) {
  const { chain, startTimestamp, endTimestamp } = options
  const torexes = await fetchTorexes(chain)
  const dailyVolumeBalances = new Balances({ chain, timestamp: endTimestamp })
  if (!torexes.length) return { dailyVolume: dailyVolumeBalances }
  const endpoint = SUPERFLUID_PROTOCOL_SUBGRAPH[chain]
  const superTokenIds = Array.from(new Set(torexes.map(t => t.inToken.id.toLowerCase())))
  const { tokens } = await request<{ tokens: any[] }>(endpoint, TOKENS_QUERY, { ids: superTokenIds })
  const tokenMap = new Map(tokens.map(t => [t.id.toLowerCase(), t]))

  for (const torex of torexes) {
    const amount = await fetchAllStreamedAmountIntoReceiver(
      torex.id,
      torex.inToken.id,
      startTimestamp,
      endTimestamp,
      chain
    )
    
    if (amount === 0n) continue
    
    const token = tokenMap.get(torex.inToken.id.toLowerCase())
    if (!token) continue
    
    if (token.isNativeAssetSuperToken) {
      // Native SuperToken (ETHx) - use zero address for native token pricing
      dailyVolumeBalances.add(ZERO_ADDRESS, amount.toString())
    } else if (!token.underlyingToken || !token.underlyingToken.id) {
      // Pure SuperToken (no underlying) - use SuperToken address itself
        dailyVolumeBalances.add(torex.inToken.id.toLowerCase(), amount.toString())
    } else {
      // Wrapped SuperToken - use underlying token address
      const underlyingDecimals = Number(token.underlyingToken.decimals)
      // SuperTokens have 18 decimals, but underlying tokens may have different decimals for tokens like USDC , so scaling down here if necessary
      const scaled = amount / (10n ** BigInt(18 - underlyingDecimals))
      if (scaled > 0n) {
        dailyVolumeBalances.add(token.underlyingToken.id.toLowerCase(), scaled.toString())
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
