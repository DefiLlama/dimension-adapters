import { Adapter, FetchOptions } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"

const CRYSTAL = "0x4De0D89d8DE993cD8a71a836BBD4fbB57436bfc3"
const abi = {
  allMarketsLength: 'uint256:allMarketsLength',
  allMarkets: 'function allMarkets(uint256) view returns (address)',
  feeCommission: 'uint8:feeCommission',
  getMarket: 'function getMarket(address market) view returns ((address quoteAsset,address baseAsset,uint256 marketType,uint256 highestBid,uint256 lowestAsk,uint256 scaleFactor,uint256 tickSize,uint256 maxPrice,uint256 minSize,uint256 takerFee,uint256 makerRebate,uint256 reserveQuote,uint256 reserveBase,bool isAMMEnabled))',
  Trade: 'event Trade(address indexed market, address indexed user, bool isBuy, uint256 amountIn, uint256 amountOut, uint256 startPrice, uint256 endPrice)',
}

const fetch = async ({ api, getLogs, createBalances }: FetchOptions) => {
  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const len = Number(await api.call({ target: CRYSTAL, abi: abi.allMarketsLength }))
  const feeCommission = BigInt(await api.call({ target: CRYSTAL, abi: abi.feeCommission }))
  const markets: string[] = await api.multiCall({ target: CRYSTAL, abi: abi.allMarkets, calls: Array.from({ length: len }, (_, i) => i.toString()) })
  const infos = await api.multiCall({ target: CRYSTAL, abi: abi.getMarket, calls: markets, permitFailure: true })
  const info: Record<string, { quote: string, taker: bigint }> = {}
  markets.forEach((m, i) => { if (infos[i]) info[m.toLowerCase()] = { quote: infos[i].quoteAsset, taker: BigInt(infos[i].takerFee) } })
  const logs = await getLogs({ target: CRYSTAL, eventAbi: abi.Trade })
  for (const l of logs) {
    const m = info[l.market.toLowerCase()]
    if (!m || m.taker === 0n) continue
    const spread = 100000n - m.taker
    const fee = l.isBuy ? BigInt(l.amountIn) * spread / 100000n : BigInt(l.amountOut) * spread / m.taker
    dailyFees.add(m.quote, fee.toString())
    dailyRevenue.add(m.quote, (fee * (100n - feeCommission) / 100n).toString())
  }
  return { dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue }
}

const adapter: Adapter = {
  version: 2,
  fetch,
  chains: [CHAIN.MONAD],
  start: "2026-09-19",
  methodology: {
    Fees: "Taker fees paid by users on every orderbook and AMM trade, in the market's quote asset.",
    UserFees: "Same as Fees.",
    Revenue: "Taker fees minus the referral commission share (feeCommission on Crystal), which is routed to third-party referrers.",
    ProtocolRevenue: "Same as Revenue; canonical markets have no creator split.",
  },
}

export default adapter
