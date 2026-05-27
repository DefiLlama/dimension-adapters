import fetchURL from "../../utils/fetchURL"
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const API_URL = "https://api.prod.paradex.trade/v1";


async function fetchMarkets() {
  const marketsRes = await fetchURL(`https://api.prod.paradex.trade/v1/markets`);
  const allMarkets = marketsRes.results || [];

  return allMarkets
    .filter(m => m.asset_kind === 'SPOT' && parseFloat(m.max_order_size) > 0)
    .map(m => ({ id: m.symbol, symbol: m.symbol.toLowerCase() }));
}

async function fetchCandles(options: FetchOptions, marketId: string) {
  try {
    const { startTimestamp, endTimestamp, startOfDay } = options;
    const klineUrl = `${API_URL}/tradingview/history?symbol=${marketId}&resolution=1D&from=${startTimestamp + 1}&to=${endTimestamp}&countback=330&price_kind=mark&request_source=paradex-ui`;
    const klineRes: { t?: number[], v?: number[] } = await fetchURL(klineUrl);

    if (!klineRes?.t || !klineRes?.v || !Array.isArray(klineRes.t) || !Array.isArray(klineRes.v)) {
      return 0;
    }

    const index = klineRes.t.indexOf(startOfDay);
    if (index === -1) return 0;

    return klineRes.v[index] || 0;
  } catch (error) {
    return 0;
  }
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const markets = await fetchMarkets();
  let dailyVolume = 0;
  for (const market of markets) {
    const volume = await fetchCandles(options, market.id);
    await new Promise(resolve => setTimeout(resolve, 1000));
    dailyVolume += volume;
  }
  return { dailyVolume };
}

const adapter: SimpleAdapter = {
  version: 1,
  chains: [CHAIN.PARADEX],
  fetch,
  start: '2026-02-04',
}

export default adapter;
