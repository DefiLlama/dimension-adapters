import { FetchOptions, FetchResultV2, FetchV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const INJECTIVE_TRADES_V1 =
  "https://sentry.exchange.grpc-web.injective.network/api/exchange/spot/v1/trades";

const INJECTIVE_MARKETS_V1 =
  "https://sentry.exchange.grpc-web.injective.network/api/exchange/spot/v1/markets";

interface SpotTrade {
  marketId?: string;
  price?: {
    price?: string;
    quantity?: string;
  };
}

interface TradesResponseV1 {
  paging?: { total?: number; from?: number; to?: number };
  trades?: SpotTrade[];
}

interface Market {
  marketId: string;
  quoteTokenMeta?: { decimals?: number };
}

interface MarketsResponseV1 {
  markets?: Market[];
}

async function getMarketsQuoteDecimals(): Promise<Map<string, number>> {
  const resp: MarketsResponseV1 = await httpGet(INJECTIVE_MARKETS_V1);
  const map = new Map<string, number>();

  for (const m of resp.markets || []) {
    const decimals = m.quoteTokenMeta?.decimals ?? 0;
    map.set(m.marketId, Number(decimals));
  }

  return map;
}

async function fetchMarketVolume(
  marketId: string,
  quoteDec: number,
  startMs: number,
  endMs: number
): Promise<number> {
  let skip = 0;
  const limit = 100;
  let total = 0;

  while (true) {
    const url =
      `${INJECTIVE_TRADES_V1}` +
      `?marketId=${marketId}` +
      `&executionSide=taker` +
      `&startTime=${startMs}` +
      `&endTime=${endMs}` +
      `&limit=${limit}` +
      `&skip=${skip}`;
  
    const resp: TradesResponseV1 = await httpGet(url);
    const trades = resp.trades || [];
  
    if (!trades.length) break;
  
    for (const t of trades) {
      const px = Number(t.price?.price || 0);
      const qty = Number(t.price?.quantity || 0);
  
      total += px * qty / Math.pow(10, quoteDec);
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

  const marketQuoteDecs = await getMarketsQuoteDecimals();

  const volumePromises = Array.from(marketQuoteDecs.entries()).map(
    ([marketId, quoteDec]) => fetchMarketVolume(marketId, quoteDec, startMs, endMs)
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
      "Sum of (price * quantity) over taker-side trades across all Injective spot markets within the 24h window.",
  },
};

export default adapter;