import { CHAIN } from "../helpers/chains"
import { FetchOptions, SimpleAdapter } from "../adapters/types"

const CRYSTAL = "0x4De0D89d8DE993cD8a71a836BBD4fbB57436bfc3"
const abi = {
  weth: 'function weth() view returns (address)',
  allMarketsLength: 'function allMarketsLength() view returns (uint256)',
  allMarkets: 'function allMarkets(uint256) view returns (address)',
  getMarket: 'function getMarket(address) view returns ((address quoteAsset,address baseAsset,uint256 marketType,uint256 highestBid,uint256 lowestAsk,uint256 scaleFactor,uint256 tickSize,uint256 maxPrice,uint256 minSize,uint256 takerFee,uint256 makerRebate,uint256 reserveQuote,uint256 reserveBase,bool isAMMEnabled))',
  Trade: 'event Trade(address indexed market, address indexed user, bool isBuy, uint256 amountIn, uint256 amountOut, uint256 startPrice, uint256 endPrice)',
  LaunchpadTrade: 'event LaunchpadTrade(address indexed token, address indexed user, bool isBuy, uint256 amountIn, uint256 amountOut, uint256 virtualNativeReserve, uint256 virtualTokenReserve)',
}

const fetch = async ({ api, getLogs, createBalances }: FetchOptions) => {
  const dailyVolume = createBalances()
  const weth: string = await api.call({ target: CRYSTAL, abi: abi.weth })
  const len = Number(await api.call({ target: CRYSTAL, abi: abi.allMarketsLength }))
  const markets: string[] = await api.multiCall({ target: CRYSTAL, abi: abi.allMarkets, calls: Array.from({ length: len }, (_, i) => i.toString()) })
  const infos = await api.multiCall({ target: CRYSTAL, abi: abi.getMarket, calls: markets, permitFailure: true })
  const quoteByMarket: Record<string, string> = {}
  markets.forEach((m, i) => { if (infos[i]) quoteByMarket[m.toLowerCase()] = infos[i].quoteAsset })
  const [trades, launchpadTrades] = await Promise.all([
    getLogs({ target: CRYSTAL, eventAbi: abi.Trade }),
    getLogs({ target: CRYSTAL, eventAbi: abi.LaunchpadTrade }),
  ])
  for (const l of trades) {
    const q = quoteByMarket[l.market.toLowerCase()]
    if (!q) continue
    dailyVolume.add(q, (l.isBuy ? l.amountIn : l.amountOut).toString())
  }
  for (const l of launchpadTrades) dailyVolume.add(weth, (l.isBuy ? l.amountIn : l.amountOut).toString())
  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.MONAD],
  start: "2025-11-24",
  methodology: "Sum of quote-asset volume from every orderbook and AMM trade, plus native-asset volume from launchpad bonding-curve trades.",
}

export default adapter
