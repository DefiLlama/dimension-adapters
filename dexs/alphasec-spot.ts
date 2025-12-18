import fetchURL from "../utils/fetchURL";
import { CHAIN } from "../helpers/chains";

const URL = "https://api.alphasec.trade/api/v1";

const fetch = async () => {
  const markets = (await fetchURL(URL + '/market')).result.filter((i: any) => i.type === 'spot')
  const marketData = (await fetchURL(URL + '/market/ticker')).result

  const marketDataMap: any = {}
  const tokenPriceMap: any = {
    '2': 1, // USDT
  }

  marketData.forEach((market: any) => {
    marketDataMap[market.marketId] = market
    tokenPriceMap[market.baseTokenId] = market.price
  })

  let dailyVolume = 0
  let dailyFees = 0

  markets.forEach((market: any) => {
    const data = marketDataMap[market.marketId]
    if (!data) return;
    const price = tokenPriceMap[market.quoteTokenId] || 0
    const usdValue = data.quoteVolume24h * price
    const totalFees = +market.takerFee + +market.makerFee
    dailyVolume += usdValue
    dailyFees += usdValue * totalFees
  })

  return { dailyVolume, dailyFees, }
}

export default {
  fetch,
  runAtCurrTime: true,
  chains: [CHAIN.ALPHASEC],
}
