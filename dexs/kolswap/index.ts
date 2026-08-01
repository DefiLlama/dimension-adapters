import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { METRIC } from '../../helpers/metrics'

type ChainConfig = {
  factory: string
  start: string
}

const CHAIN_CONFIGS: Record<string, ChainConfig> = {
  [CHAIN.ROBINHOOD]: {
    factory: '0xdB2Ec80E55527b5D858b54173083139679f5DE6f',
    start: '2026-07-23',
  },
  [CHAIN.BSC]: {
    factory: '0x6af79510599dE74E5922A2771b29160dA8b7b4c1',
    start: '2026-07-27',
  },
}

const SWAP_EVENT = 'event Swap(address indexed trader,address indexed tokenIn,uint256 amountIn,uint256 amountOut,uint256 creatorFee,uint256 protocolFee,uint256 lpFee,address indexed recipient)'

const fetch = async (options: FetchOptions) => {
  const config = CHAIN_CONFIGS[options.chain]

  const pairCount = await options.api.call({ target: config.factory, abi: 'uint256:allPairsLength' })
  const pairs = pairCount ? await options.api.multiCall({ abi: 'function allPairs(uint256) view returns (address)', calls: Array.from({ length: pairCount }, (_, index) => ({ target: config.factory, params: [index] })) }) : []
  const quotes = pairs.length ? await options.api.multiCall({ abi: 'address:quoteAsset', calls: pairs }) : []
  const quoteByPool = new Map(pairs.map((pair: string, index: number) => [pair.toLowerCase(), quotes[index]]))

  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  if (!pairs.length) return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue }

  const logs = await options.getLogs({
    targets: pairs,
    eventAbi: SWAP_EVENT,
    entireLog: true,
    parseLog: true,
  })

  for (const log of logs) {
    const quote = quoteByPool.get(String(log.address).toLowerCase()) as string | undefined
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
    [METRIC.SWAP_FEES]: 'Swap fees charged by the KOLSwap protocol.',
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
  adapter: CHAIN_CONFIGS,
  methodology: {
    Volume: 'Gross quote notional; sell fees are added back to net quote output.',
    Fees: 'Swap fees charged by the KOLSwap protocol.',
    Revenue: 'Protocol fee routed to the protocol fee router.',
    ProtocolRevenue: 'Protocol fee routed to the KOLMarket protocol fee router.',
    SupplySideRevenue: 'Creator fee routed to the creator allocation and LP fee paid to liquidity providers.',
  },
  breakdownMethodology,
}

export default adapter
