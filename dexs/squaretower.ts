import { FetchOptions, FetchResultV2, FetchV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const MARKET_ID = "0x56cb0ef0b9d59125373112523b0adfc446dff989268547fa1a3379a6f98f5efd";
const INJECTIVE_TRADES_V2 = "https://sentry.exchange.grpc-web.injective.network/api/exchange/derivative/v2/trades";
const INJECTIVE_MARKET_V1 = (marketId: string) => `https://sentry.exchange.grpc-web.injective.network/api/exchange/derivative/v1/markets/${marketId}`;

interface DerivativeTradeV2 {
  marketId?: string;
  positionDelta?: {
    executionPrice?: string;
    executionQuantity?: string;
  };
  executedAt?: number; // ms
  tradeId?: string;
}

interface TradesResponseV2 {
  paging?: { total?: number; from?: number; to?: number };
  trades?: DerivativeTradeV2[];
}

interface MarketMetaResponseV1 {
  market?: {
    ticker?: string;
    oracleScaleFactor?: number;
  };
}

async function getPriceScale(): Promise<number> {
  const meta: MarketMetaResponseV1 = await httpGet(INJECTIVE_MARKET_V1(MARKET_ID));
  const scale = meta?.market?.oracleScaleFactor ?? 0;
  return Math.pow(10, Number(scale));
}

async function fetchTradesSumNotionalUSD(startMs: number, endMs: number): Promise<number> {
  let skip = 0;
  const limit = 100;
  let total = 0;
  const priceScale = await getPriceScale();

  while (true) {
    const url = `${INJECTIVE_TRADES_V2}?marketId=${MARKET_ID}&executionSide=taker&startTime=${startMs}&endTime=${endMs}&limit=${limit}&skip=${skip}`;
    const resp: TradesResponseV2 = await httpGet(url);
    const trades = resp.trades || [];
    for (const t of trades) {
      if (t.marketId && t.marketId.toLowerCase() !== MARKET_ID.toLowerCase()) continue;
      const rawPx = t.positionDelta?.executionPrice ? Number(t.positionDelta.executionPrice) : 0;
      const px = priceScale > 0 ? rawPx / priceScale : rawPx;
      const qty = t.positionDelta?.executionQuantity ? Number(t.positionDelta.executionQuantity) : 0;
      total += px * qty;
    }
    if (!trades.length || (resp.paging && resp.paging.to !== undefined && resp.paging.to < skip + limit)) break;
    skip += limit;
  }
  return total;
}

const fetch: FetchV2 = async (options: FetchOptions): Promise<FetchResultV2> => {
  const startMs = options.startTimestamp * 1000;
  const endMs = options.endTimestamp * 1000;
  const dailyVolume = await fetchTradesSumNotionalUSD(startMs, endMs);
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.INJECTIVE],
  runAtCurrTime: true,
  start: "2025-08-17",
  methodology: {
    Volume: "Sum of executionPrice (scaled by oracleScaleFactor) * executionQuantity over taker-side trades for the H100/USDT market within the 24h window.",
  },
};

export default adapter;
