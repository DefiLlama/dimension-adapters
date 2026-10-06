import { CHAIN } from "../helpers/chains"
import { FetchOptions, SimpleAdapter } from "../adapters/types"

const CRYSTAL = "0x508254c838B2e936B0631440c5C6E3AB3a4a98BD"
const abi = {
  allMarketsLength: 'function allMarketsLength() view returns (uint256)',
  allMarkets: 'function allMarkets(uint256) view returns (address)',
  getMarket: 'function getMarket(address) view returns ((address quoteAsset,address baseAsset,uint256 marketType,uint256 highestBid,uint256 lowestAsk,uint256 scaleFactor,uint256 tickSize,uint256 maxPrice,uint256 minSize,uint256 takerFee,uint256 makerRebate,uint256 reserveQuote,uint256 reserveBase,bool isAMMEnabled))',
  Trade: 'event Trade(address indexed market, address indexed user, bool isBuy, uint256 amountIn, uint256 amountOut, uint256 startPrice, uint256 endPrice)',
}

const fetch = async ({ api, getLogs, createBalances }: FetchOptions) => {
  const dailyVolume = createBalances()
  const len = Number(await api.call({ target: CRYSTAL, abi: abi.allMarketsLength }))
  const markets: string[] = await api.multiCall({ target: CRYSTAL, abi: abi.allMarkets, calls: Array.from({ length: len }, (_, i) => i.toString()) })
  const infos = await api.multiCall({ target: CRYSTAL, abi: abi.getMarket, calls: markets, permitFailure: true })
  const quoteByMarket: Record<string, string> = {}
  markets.forEach((m, i) => { if (infos[i]) quoteByMarket[m.toLowerCase()] = infos[i].quoteAsset })
  const trades = await getLogs({ target: CRYSTAL, eventAbi: abi.Trade })
  for (const l of trades) {
    const q = quoteByMarket[l.market.toLowerCase()]
    if (!q) continue
    dailyVolume.add(q, (l.isBuy ? l.amountIn : l.amountOut).toString())
  }
  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.MONAD],
  start: "2026-09-19",
  methodology: {
    Volume: "Quote-asset volume from orderbook and AMM trades. Launchpad bonding-curve volume is tracked in crystal-launchpad.",
  },
}

export default adapter
