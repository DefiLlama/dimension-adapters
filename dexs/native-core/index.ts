import type { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpPost } from "../../utils/fetchURL";

// Native Core CLOB — listed separately from Native RFQ (`dexs/native`).
// Public gateway: POST /api/v3/info (https://api-ui.native.org)
//   type: "meta"      → market catalog (base/quote per market_id)
//   type: "ticker24h" → rolling 24h taker quote notional per market
const INFO_URL = "https://api-ui.native.org/api/v3/info";

type InfoEnvelope<T> = {
  code: number;
  message?: string;
  data: T;
};

type MarketRow = {
  market_id?: number; // omitted on the wire when 0 (Go omitempty)
  quote_symbol: string;
};

type MarketTicker = {
  market_id?: number;
  symbol: string;
  volume_24h_quote: string;
  has_trades_24h: boolean;
};

const USD_QUOTES = new Set(["USDC", "USDT"]);

async function postInfo<T>(body: Record<string, unknown>): Promise<T> {
  const res: InfoEnvelope<T> = await httpPost(INFO_URL, body, {
    headers: { "content-type": "application/json" },
  });
  if (!res || res.code !== 0) {
    throw new Error(
      `Native Core info ${JSON.stringify(body)} failed: ${res?.message ?? "no data"}`,
    );
  }
  return res.data;
}

const fetch: FetchV2 = async (_options: FetchOptions) => {
  const [meta, tickerSnap] = await Promise.all([
    postInfo<{ markets: MarketRow[] | null }>({ type: "meta" }),
    postInfo<{ tickers: MarketTicker[] }>({ type: "ticker24h" }),
  ]);

  const quoteByMarket = new Map<number, string>();
  for (const market of meta.markets ?? []) {
    quoteByMarket.set(market.market_id ?? 0, market.quote_symbol);
  }

  let dailyVolume = 0;
  for (const ticker of tickerSnap.tickers ?? []) {
    if (!ticker.has_trades_24h) continue;
    const quote =
      quoteByMarket.get(ticker.market_id ?? 0) ?? ticker.symbol.split("/")[1];
    if (!USD_QUOTES.has(quote)) continue;
    const quoteVolume = Number(ticker.volume_24h_quote);
    if (!Number.isFinite(quoteVolume) || quoteVolume < 0) {
      throw new Error(
        `Native Core ticker ${ticker.symbol} returned invalid volume`,
      );
    }
    dailyVolume += quoteVolume;
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.NATIVE_CORE],
  start: "2026-05-19",
  runAtCurrTime: true,
  methodology: {
    Volume:
      "Rolling 24h taker quote notional on Native Core CLOB markets, from POST /api/v3/info ticker24h joined to the meta market list. Each fill is counted once. USDC- and USDT-quoted markets are included; other quote assets are omitted until a public historical range API lands.",
  },
};

export default adapter;
