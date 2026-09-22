import { Adapter, FetchOptions } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"

const CRYSTAL = "0x508254c838B2e936B0631440c5C6E3AB3a4a98BD"
const abi = {
  allMarketsLength: 'uint256:allMarketsLength',
  allMarkets: 'function allMarkets(uint256) view returns (address)',
  feeCommission: 'uint8:feeCommission',
  getMarket: 'function getMarket(address market) view returns ((address quoteAsset,address baseAsset,uint256 marketType,uint256 highestBid,uint256 lowestAsk,uint256 scaleFactor,uint256 tickSize,uint256 maxPrice,uint256 minSize,uint256 takerFee,uint256 makerRebate,uint256 reserveQuote,uint256 reserveBase,bool isAMMEnabled))',
  Trade: 'event Trade(address indexed market, address indexed user, bool isBuy, uint256 amountIn, uint256 amountOut, uint256 startPrice, uint256 endPrice)',
  Sync: 'event Sync(address indexed market, uint112 reserve0, uint112 reserve1)',
}

const fetch = async ({ api, getLogs, createBalances }: FetchOptions) => {
  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const len = Number(await api.call({ target: CRYSTAL, abi: abi.allMarketsLength }))
  const feeCommission = BigInt(await api.call({ target: CRYSTAL, abi: abi.feeCommission }))
  const markets: string[] = await api.multiCall({ target: CRYSTAL, abi: abi.allMarkets, calls: Array.from({ length: len }, (_, i) => i.toString()) })
  const infos = await api.multiCall({ target: CRYSTAL, abi: abi.getMarket, calls: markets, permitFailure: true })
  const info: Record<string, { quote: string, taker: bigint, ammFee: bigint }> = {}
  markets.forEach((m, i) => { if (infos[i]) info[m.toLowerCase()] = { quote: infos[i].quoteAsset, taker: BigInt(infos[i].takerFee), ammFee: BigInt(infos[i].marketType) === 4n ? 9900n : 9975n } })
  const [trades, syncs] = await Promise.all([
    getLogs({ target: CRYSTAL, eventAbi: abi.Trade }),
    getLogs({ target: CRYSTAL, eventAbi: abi.Sync }),
  ])
  const ammTouched = new Set(syncs.map((s: any) => `${s.market.toLowerCase()}:${s.transactionHash}`))
  for (const l of trades) {
    const m = info[l.market.toLowerCase()]
    if (!m || m.taker === 0n) continue
    const spread = 100000n - m.taker
    const takerFeeAmt = l.isBuy ? BigInt(l.amountIn) * spread / 100000n : BigInt(l.amountOut) * spread / m.taker
    dailyFees.add(m.quote, takerFeeAmt.toString())
    dailyRevenue.add(m.quote, (takerFeeAmt * (100n - feeCommission) / 100n).toString())
    if (ammTouched.has(`${l.market.toLowerCase()}:${l.transactionHash}`)) {
      const ammSpread = 10000n - m.ammFee
      const ammLpFee = l.isBuy ? BigInt(l.amountIn) * ammSpread / 10000n : BigInt(l.amountOut) * ammSpread / m.ammFee
      dailyFees.add(m.quote, ammLpFee.toString())
    }
  }
  return { dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue }
}

const adapter: Adapter = {
  version: 2,
  fetch,
  chains: [CHAIN.MONAD],
  start: "2026-09-19",
  methodology: {
    Fees: "Taker fees paid on every orderbook and AMM trade plus the AMM constant-product spread (LP fee) for AMM-routed trades, in the market's quote asset.",
    UserFees: "Same as Fees.",
    Revenue: "Taker fees minus the referral commission share (feeCommission on Crystal). AMM LP spread is excluded because it accrues to LPs, not the protocol.",
    ProtocolRevenue: "Same as Revenue; canonical markets have no creator split.",
  },
}

export default adapter
