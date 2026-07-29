import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { METRIC } from '../../helpers/metrics'

// Verified factory and deployment source: https://robinhoodchain.blockscout.com/address/0xdB2Ec80E55527b5D858b54173083139679f5DE6f
const FACTORY = '0xdB2Ec80E55527b5D858b54173083139679f5DE6f'
// Metrics begin on the factory deployment date shown by the verified explorer record above.
const START = '2026-07-23'
const SWAP_EVENT = 'event Swap(address indexed trader,address indexed tokenIn,uint256 amountIn,uint256 amountOut,uint256 creatorFee,uint256 protocolFee,uint256 lpFee,address indexed recipient)'

async function listPairs(api: FetchOptions['api']): Promise<string[]> {
  const count = Number(await api.call({ target: FACTORY, abi: 'uint256:allPairsLength', block: 'latest' }))
  if (!count) return []
  return api.multiCall({
    abi: 'function allPairs(uint256) view returns (address)',
    calls: Array.from({ length: count }, (_, index) => ({ target: FACTORY, params: [index] })),
    block: 'latest',
  }) as Promise<string[]>
}

const fetch = async (options: FetchOptions) => {
  const pairs = await listPairs(options.api)
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  if (!pairs.length) return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue }
  const quotes = await options.api.multiCall({ abi: 'address:quoteAsset', calls: pairs, block: 'latest' }) as string[]
  const quoteByPool = new Map(pairs.map((pair, index) => [pair.toLowerCase(), quotes[index]]))
  const logs = await options.getLogs({ targets: pairs, eventAbi: SWAP_EVENT, entireLog: true }) as Array<{
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
    dailyVolume.add(quote, grossVolume)
    dailyFees.add(quote, fees, METRIC.SWAP_FEES)
    dailyRevenue.add(quote, protocol, METRIC.PROTOCOL_FEES)
    dailyProtocolRevenue.add(quote, protocol, METRIC.PROTOCOL_FEES)
    dailySupplySideRevenue.add(quote, creator, METRIC.CREATOR_FEES)
    dailySupplySideRevenue.add(quote, lp, METRIC.LP_FEES)
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
