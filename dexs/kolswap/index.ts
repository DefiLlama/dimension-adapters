import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { METRIC } from '../../helpers/metrics'
import { ChainApi } from '@defillama/sdk'
import { formatUnits } from 'ethers'

// Verified factory and deployment source: https://robinhoodchain.blockscout.com/address/0xdB2Ec80E55527b5D858b54173083139679f5DE6f
const FACTORY = '0xdB2Ec80E55527b5D858b54173083139679f5DE6f'
// Metrics begin on the factory deployment date shown by the verified explorer record above.
const START = '2026-07-23'
const SWAP_EVENT = 'event Swap(address indexed trader,address indexed tokenIn,uint256 amountIn,uint256 amountOut,uint256 creatorFee,uint256 protocolFee,uint256 lpFee,address indexed recipient)'
// Canonical WETH quote asset: https://robinhoodchain.blockscout.com/address/0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73
const QUOTE_ASSET_METADATA: Record<string, { coingeckoId: string, decimals: number }> = {
  '0x0bd7d308f8e1639fab988df18a8011f41eacad73': { coingeckoId: 'ethereum', decimals: 18 },
}
let marketMetadataPromise: Promise<{ pairs: string[], quoteByPool: Map<string, string> }> | undefined

/** Lists pair proxies from the append-only factory using current immutable metadata. */
async function listPairs(api: FetchOptions['api']): Promise<string[]> {
  const count = Number(await api.call({ target: FACTORY, abi: 'uint256:allPairsLength' }))
  if (!count) return []
  return api.multiCall({
    abi: 'function allPairs(uint256) view returns (address)',
    calls: Array.from({ length: count }, (_, index) => ({ target: FACTORY, params: [index] })),
  }) as Promise<string[]>
}

/** Loads immutable pair and quote metadata once per adapter process. */
async function getMarketMetadata(chain: string) {
  if (!marketMetadataPromise) {
    marketMetadataPromise = (async () => {
      const latestApi = new ChainApi({ chain })
      const pairs = await listPairs(latestApi)
      const quotes = pairs.length
        ? await latestApi.multiCall({ abi: 'address:quoteAsset', calls: pairs }) as string[]
        : []
      return {
        pairs,
        quoteByPool: new Map(pairs.map((pair, index) => [pair.toLowerCase(), quotes[index]])),
      }
    })().catch((error) => {
      marketMetadataPromise = undefined
      throw error
    })
  }
  return marketMetadataPromise
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
  const { pairs, quoteByPool } = await getMarketMetadata(options.chain)
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
    maxBlockRange: 500000,
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
  fetch,
  start: START,
  chains: [CHAIN.ROBINHOOD],
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
