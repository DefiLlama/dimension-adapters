import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

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

const fetch = async (_timestamp: number, _a: any, options: FetchOptions) => {
  if (options.chain !== CHAIN.BSC) {
    return { dailyVolume: 0 };
  }
  const data = (await httpGet(dayAPI)) as TickerItem[];
  const dailyVolume = data
    .filter((d) => d.baseAsset !== "TEST")
    .reduce((p, c) => {
      let vol = Number(c.quoteVolume);
      if (c.quoteAsset !== "USDT") {
        const toUsdt = data.find(
          (d) => d.baseAsset === c.quoteAsset && d.quoteAsset === "USDT"
        );
        if (toUsdt) {
          vol = Number(toUsdt.lastPrice) * Number(vol);
        }
      }
      return p + vol;
    }, 0);

  return { dailyVolume };
};

fetch(0, 0, { chain: CHAIN.BSC } as any).then(console.log);

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      runAtCurrTime: true,
      start: "2025-09-02",
    },
  },
};

export default adapter;
