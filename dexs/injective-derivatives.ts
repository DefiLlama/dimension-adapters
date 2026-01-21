import { FetchOptions, FetchResultV2, FetchV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const INJECTIVE_TRADES_V2 =
  "https://sentry.exchange.grpc-web.injective.network/api/exchange/derivative/v2/trades";

const INJECTIVE_MARKETS_V1 =
  "https://sentry.exchange.grpc-web.injective.network/api/exchange/derivative/v1/markets";

interface DerivativeTradeV2 {
  marketId?: string;
  positionDelta?: {
    executionPrice?: string;
    executionQuantity?: string;
  };
}

interface TradesResponseV2 {
  paging?: { total?: number; from?: number; to?: number };
  trades?: DerivativeTradeV2[];
}

interface Market {
  marketId: string;
  oracleScaleFactor?: number;
}

interface MarketsResponseV1 {
  markets?: Market[];
}

async function getMarketsPriceScales(): Promise<Map<string, number>> {
  const resp: MarketsResponseV1 = await httpGet(INJECTIVE_MARKETS_V1);
  const map = new Map<string, number>();

  for (const m of resp.markets || []) {
    const scale = m.oracleScaleFactor ?? 0;
    map.set(m.marketId, Math.pow(10, Number(scale)));
  }

  return map;
}

async function fetchMarketVolume(
  marketId: string,
  priceScale: number,
  startMs: number,
  endMs: number
): Promise<number> {
  let skip = 0;
  const limit = 100;
  let total = 0;

  while (true) {
    const url =
      `${INJECTIVE_TRADES_V2}` +
      `?marketId=${marketId}` +
      `&executionSide=taker` +
      `&startTime=${startMs}` +
      `&endTime=${endMs}` +
      `&limit=${limit}` +
      `&skip=${skip}`;
  
    const resp: TradesResponseV2 = await httpGet(url);
    const trades = resp.trades || [];
  
    if (!trades.length) break;
  
    for (const t of trades) {
      const rawPx = Number(t.positionDelta?.executionPrice || 0);
      const qty = Number(t.positionDelta?.executionQuantity || 0);
      const px = priceScale > 0 ? rawPx / priceScale : rawPx;
  
      total += px * qty;
    }

    if (trades.length < limit) break;
    
    skip += limit;
  }  

  return total;
}

const fetch: FetchV2 = async (
  options: FetchOptions
): Promise<FetchResultV2> => {

  const startMs = options.startTimestamp * 1000;
  const endMs = options.endTimestamp * 1000;

  const marketScales = await getMarketsPriceScales();

  const volumePromises = Array.from(marketScales.entries()).map(
    ([marketId, scale]) => fetchMarketVolume(marketId, scale, startMs, endMs)
  );

  const volumes = await Promise.all(volumePromises);
  const dailyVolume = volumes.reduce((sum, vol) => sum + vol, 0);

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.INJECTIVE],
  runAtCurrTime: true,
  start: "2021-07-17",
  methodology: {
    Volume:
      "Sum of executionPrice (scaled by oracleScaleFactor) * executionQuantity over taker-side trades across all Injective perpetual derivative markets within the 24h window.",
  },
};

export default adapter;