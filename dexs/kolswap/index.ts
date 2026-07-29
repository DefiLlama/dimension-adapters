import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'

const FACTORY = '0xdB2Ec80E55527b5D858b54173083139679f5DE6f'
const START = '2026-07-23'
const SWAP_EVENT = 'event Swap(address indexed trader,address indexed tokenIn,uint256 amountIn,uint256 amountOut,uint256 creatorFee,uint256 protocolFee,uint256 lpFee,address indexed recipient)'

async function listPairs(api: FetchOptions['api']): Promise<string[]> {
  const count = Number(await api.call({ target: FACTORY, abi: 'uint256:allPairsLength' }))
  if (!count) return []
  return api.multiCall({ abi: 'function allPairs(uint256) view returns (address)', calls: Array.from({ length: count }, (_, index) => ({ target: FACTORY, params: [index] })) }) as Promise<string[]>
}

const fetch = async (options: FetchOptions) => {
  const pairs = await listPairs(options.api)
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  if (!pairs.length) return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue }
  const quotes = await options.api.multiCall({ abi: 'address:quoteAsset', calls: pairs }) as string[]
  const quoteByPool = new Map(pairs.map((pair, index) => [pair.toLowerCase(), quotes[index]]))
  const logs = await options.getLogs({ targets: pairs, eventAbi: SWAP_EVENT }) as Array<Record<string, string | bigint>>
  for (const log of logs) {
    const quote = quoteByPool.get(String(log.address).toLowerCase())
    if (!quote) continue
    const creator = BigInt(log.creatorFee)
    const protocol = BigInt(log.protocolFee)
    const lp = BigInt(log.lpFee)
    const fees = creator + protocol + lp
    const quoteIsInput = String(log.tokenIn).toLowerCase() === quote.toLowerCase()
    const grossVolume = quoteIsInput ? BigInt(log.amountIn) : BigInt(log.amountOut) + fees
    dailyVolume.add(quote, grossVolume)
    dailyFees.add(quote, fees)
    dailyRevenue.add(quote, protocol)
    dailyProtocolRevenue.add(quote, protocol)
    dailySupplySideRevenue.add(quote, creator + lp)
  }
  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue }
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
}

export default adapter
