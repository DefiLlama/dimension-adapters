import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

type TickerItem = {
  symbol: string;
  priceChange: string;
  priceChangePercent: string;
  weightedAvgPrice: string;
  lastPrice: string;
  lastQty: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  openTime: number;
  closeTime: number;
  firstId: number;
  lastId: number;
  count: number;
  baseAsset: string;
  quoteAsset: string;
  bidPrice: string;
  bidQty: string;
  askPrice: string;
  askQty: string;
};

const dayAPI = "https://sapi.asterdex.com/api/v1/ticker/24hr";

const fetch = async () => {
  const data = (await httpGet(dayAPI)) as TickerItem[];
  const tickerPrices: { [symbol: string]: number } = {};
  data.forEach((t) => {
    if (t.quoteAsset === "USDT") {
      tickerPrices[t.baseAsset] = Number(t.lastPrice);
    }
    tickerPrices[t.symbol] = Number(t.lastPrice);
  });
  const dailyVolume = data
    .filter((d) => d.baseAsset !== "TEST")
    .reduce((p: any, c: any) => {
      let vol = Number(c.quoteVolume);
      let price = 1
      if (c.quoteAsset !== "USDT") {
        price = tickerPrices[c.quoteAsset]
        if (!price) return p;
      }
      return p + (vol * price);
    }, 0);

  return { dailyVolume };
};


export default {
  fetch,
  version: 2,
  runAtCurrTime: true,
  start: "2025-09-02",
  chains: [CHAIN.OFF_CHAIN],
};

