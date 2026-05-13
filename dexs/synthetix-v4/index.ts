import { CHAIN } from "../../helpers/chains";
import { httpPost } from "../../utils/fetchURL";

const API = "https://papi.synthetix.io/v1/info";
const DAY_MS = 24 * 60 * 60 * 1000;

const post = async (params: any) => {
  const res = await httpPost(API, { params }, { headers: { "User-Agent": "defillama-dimension-adapters/1.0" } });
  if (res.status !== "ok" || res.response === undefined) throw new Error(`Synthetix API error: ${params.action}`);
  return res.response;
};

const fetch = async (_: any, __: any, options: any) => {
  const startMs = options.startOfDay * 1000;
  const endMs = startMs + DAY_MS;
  const dailyVolume = options.createBalances();
  const markets = Object.values(await post({ action: "getMarketPrices" })).filter((market: any) => market?.symbol);

  for (const market of markets as any[]) {
    try {
      const { candles } = await post({ action: "getCandles", symbol: market.symbol, interval: "1d", startTime: startMs, endTime: endMs, limit: 0 });
      const dailyCandles = (candles || []).filter((candle: any) => candle.openTime >= startMs && candle.openTime < endMs);
      if (!dailyCandles.length) {
        console.warn(`No Synthetix V4 candle found for ${market.symbol} in [${startMs}, ${endMs}), skipping`);
        continue;
      }
      dailyCandles.forEach((candle: any) => dailyVolume.addUSDValue(Number(candle.quoteVolume || 0)));
    } catch (e) {
      console.warn(`Failed to fetch Synthetix V4 candle for ${market.symbol} in [${startMs}, ${endMs}), skipping: ${String(e)}`);
    }
  }

  return { dailyVolume };
};

const methodology = {
  dailyVolume: "24h perpetual trading volume from Synthetix-v4.",
};

const adapter = {
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: "2025-12-18",
  methodology,
};

export default adapter;
