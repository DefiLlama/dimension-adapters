import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { METRIC } from '../../helpers/metrics'
import { ChainApi } from '@defillama/sdk'
import { formatUnits } from 'ethers'

type ChainConfig = {
  factory: string
  start: string
  maxBlockRange: number
}

const CHAIN_CONFIGS: Record<string, ChainConfig> = {
  [CHAIN.ROBINHOOD]: {
    // Verified factory: https://robinhoodchain.blockscout.com/address/0xdB2Ec80E55527b5D858b54173083139679f5DE6f
    factory: '0xdB2Ec80E55527b5D858b54173083139679f5DE6f',
    start: '2026-07-23',
    maxBlockRange: 500000,
  },
  [CHAIN.BSC]: {
    // Verified factory: https://bscscan.com/address/0x6af79510599dE74E5922A2771b29160dA8b7b4c1
    factory: '0x6af79510599dE74E5922A2771b29160dA8b7b4c1',
    start: '2026-07-27',
    maxBlockRange: 50000,
  },
}
const SWAP_EVENT = 'event Swap(address indexed trader,address indexed tokenIn,uint256 amountIn,uint256 amountOut,uint256 creatorFee,uint256 protocolFee,uint256 lpFee,address indexed recipient)'
// Canonical WETH quote asset: https://robinhoodchain.blockscout.com/address/0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73
const QUOTE_ASSET_METADATA: Record<string, { coingeckoId: string, decimals: number }> = {
  '0x0bd7d308f8e1639fab988df18a8011f41eacad73': { coingeckoId: 'ethereum', decimals: 18 },
  '0x55d398326f99059ff775485246999027b3197955': { coingeckoId: 'tether', decimals: 18 },
  '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c': { coingeckoId: 'binancecoin', decimals: 18 },
}
type MarketMetadata = { pairs: string[], quoteByPool: Map<string, string> }
const marketMetadataPromises = new Map<string, Promise<MarketMetadata>>()

/** Lists pair proxies from the append-only factory using current immutable metadata. */
async function listPairs(api: FetchOptions['api'], factory: string): Promise<string[]> {
  const count = Number(await api.call({ target: factory, abi: 'uint256:allPairsLength' }))
  if (!count) return []
  return api.multiCall({
    abi: 'function allPairs(uint256) view returns (address)',
    calls: Array.from({ length: count }, (_, index) => ({ target: factory, params: [index] })),
  }) as Promise<string[]>
}

/** Loads immutable pair and quote metadata once per chain and adapter process. */
async function getMarketMetadata(chain: string, factory: string): Promise<MarketMetadata> {
  let pending = marketMetadataPromises.get(chain)
  if (!pending) {
    pending = (async () => {
      const latestApi = new ChainApi({ chain })
      const pairs = await listPairs(latestApi, factory)
      const quotes = pairs.length
        ? await latestApi.multiCall({ abi: 'address:quoteAsset', calls: pairs }) as string[]
        : []
      return {
        pairs,
        quoteByPool: new Map(pairs.map((pair, index) => [pair.toLowerCase(), quotes[index]])),
      }
    })().catch((error) => {
      marketMetadataPromises.delete(chain)
      throw error
    })
    marketMetadataPromises.set(chain, pending)
  }
  return pending
}

/** Adds a raw quote-asset amount using canonical historical pricing when available. */
function addQuoteAmount(
  balances: ReturnType<FetchOptions['createBalances']>,
  quote: string,
  amount: bigint,
  label?: METRIC,
) {
  const metadata = QUOTE_ASSET_METADATA[quote.toLowerCase()]
  if (!metadata) {
    balances.add(quote, amount, label)
    return
  }
  balances.addCGToken(metadata.coingeckoId, formatUnits(amount, metadata.decimals), label)
}

const fetch = async (options: FetchOptions) => {
  const config = CHAIN_CONFIGS[options.chain]
  if (!config) throw new Error(`Unsupported KOLSwap chain: ${options.chain}`)
  const { pairs, quoteByPool } = await getMarketMetadata(options.chain, config.factory)
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  if (!pairs.length) return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue }
  const logs = await options.getLogs({
    noTarget: true,
    eventAbi: SWAP_EVENT,
    entireLog: true,
    maxBlockRange: config.maxBlockRange,
  }) as Array<{
    address: string
    args: Record<string, string | bigint>
  }>
  for (const log of logs) {
    const quote = quoteByPool.get(String(log.address).toLowerCase())
    if (!quote) continue
    const creator = BigInt(log.args.creatorFee)
    const protocol = BigInt(log.args.protocolFee)
    const lp = BigInt(log.args.lpFee)
    const fees = creator + protocol + lp
    const quoteIsInput = String(log.args.tokenIn).toLowerCase() === quote.toLowerCase()
    const grossVolume = quoteIsInput ? BigInt(log.args.amountIn) : BigInt(log.args.amountOut) + fees
    addQuoteAmount(dailyVolume, quote, grossVolume)
    addQuoteAmount(dailyFees, quote, fees, METRIC.SWAP_FEES)
    addQuoteAmount(dailyRevenue, quote, protocol, METRIC.PROTOCOL_FEES)
    addQuoteAmount(dailyProtocolRevenue, quote, protocol, METRIC.PROTOCOL_FEES)
    addQuoteAmount(dailySupplySideRevenue, quote, creator, METRIC.CREATOR_FEES)
    addQuoteAmount(dailySupplySideRevenue, quote, lp, METRIC.LP_FEES)
  }
  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue }
}

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: 'Creator, protocol, and LP fees charged by KOLSwap pairs.',
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: 'Protocol fee routed to the KOLMarket protocol fee router.',
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]: 'Protocol fee routed to the KOLMarket protocol fee router.',
  },
  SupplySideRevenue: {
    [METRIC.CREATOR_FEES]: 'Creator fee routed to the creator allocation.',
    [METRIC.LP_FEES]: 'LP fee retained for liquidity providers.',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ROBINHOOD]: {
      fetch,
      start: CHAIN_CONFIGS[CHAIN.ROBINHOOD].start,
    },
    [CHAIN.BSC]: {
      fetch,
      start: CHAIN_CONFIGS[CHAIN.BSC].start,
    },
  },
  methodology: {
    Volume: 'Gross quote notional; sell fees are added back to net quote output.',
    Fees: 'Creator, protocol, and LP fees paid in quote assets.',
    Revenue: 'Protocol fee routed to the protocol fee router.',
    ProtocolRevenue: 'Same as Revenue; only the protocol fee accrues to KOLMarket.',
    SupplySideRevenue: 'Creator fee plus LP fee.',
  },
  breakdownMethodology,
}

export default adapter
