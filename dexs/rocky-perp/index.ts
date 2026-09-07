import { CHAIN } from "../../helpers/chains";
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

/*
 * Rocky Exchange — Canton Network perpetual futures DEX (volume + fees).
 *
 * Sibling adapter: dexs/rocky-spot/index.ts (spot orderbook).
 *
 * Source (public, unauthenticated, Binance-compatible perp market-data):
 *   https://api.rocky.exchange/fapi/v1/ticker/24hr
 *
 * Returns a rolling 24-hour aggregation across every perp symbol.
 * `quoteVolume` on each row is USD-denominated because Rocky's perp markets
 * margin in USD-pegged assets (all symbols end in USDT), so summing rows
 * directly yields USD notional.
 *
 * Perpetual margin is collateralized on Canton mainnet via `LockedAmulet`
 * contracts; matching is performed off-chain by Rocky's engine, same pattern
 * as most orderbook DEXes.
 *
 * runAtCurrTime + pullHourly:false — Rocky's Binance-compat ticker exposes a
 * live rolling 24h window only; there is no historical time-travel or
 * per-hour bucketing.
 */

const PERP_TICKER_URL = "https://api.rocky.exchange/fapi/v1/ticker/24hr";

// USD-pegged quote assets on Rocky perp — every perp symbol is Binance-style
// concatenated (e.g. BTCUSDT), so we look for a trailing USD-quote suffix.
const USD_QUOTE_ASSETS = new Set(["USDT", "USDC", "USDCX", "CUSD"]);

const quoteAsset = (symbol: string): string => {
  const upper = symbol.toUpperCase();
  for (const q of USD_QUOTE_ASSETS) {
    if (upper.endsWith(q)) return q;
  }
  return "";
};

type Ticker24hRow = {
  symbol: string;
  quoteVolume: string;
};

const sumUsdQuoteVolume = (rows: unknown): number => {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Rocky perp ticker/24hr returned empty or non-array payload");
  }
  let total = 0;
  let usdQuotedRowCount = 0;
  for (const row of rows as Ticker24hRow[]) {
    const symbol = typeof row?.symbol === "string" ? row.symbol.trim() : "";
    if (!symbol) {
      throw new Error("Rocky perp ticker/24hr row missing symbol");
    }
    if (!USD_QUOTE_ASSETS.has(quoteAsset(symbol))) continue;
    const rawVolume = typeof row?.quoteVolume === "string" ? row.quoteVolume.trim() : "";
    if (rawVolume.length === 0) {
      throw new Error(`Rocky perp ticker/24hr row ${symbol} missing quoteVolume`);
    }
    const v = Number(rawVolume);
    if (!Number.isFinite(v) || v < 0) {
      throw new Error(`Rocky perp ticker/24hr row ${symbol} invalid quoteVolume=${rawVolume}`);
    }
    total += v;
    usdQuotedRowCount += 1;
  }
  if (usdQuotedRowCount === 0) {
    throw new Error("Rocky perp ticker/24hr returned no USD-quoted rows");
  }
  return total;
};

const fetch = async (_options: FetchOptions): Promise<FetchResult> => {
  const rows = await fetchURL(PERP_TICKER_URL);
  const dailyVolume = sumUsdQuoteVolume(rows);

  return {
    dailyVolume,
  };
};

const methodology = {
  Volume:
    "Sum of `quoteVolume` for every USD-quoted perp symbol returned by Rocky's Binance-compatible 24h ticker endpoint at /fapi/v1/ticker/24hr. Rocky's perp markets margin in USD-pegged assets (BTCUSDT, ETHUSDT, CCUSDT), so `quoteVolume` is directly USD notional and the sum requires no external price conversion.",
};


const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.CANTON],
  runAtCurrTime: true,
  // Rocky's ticker/24hr endpoint exposes a live rolling 24h window only.
  // There is no per-hour bucketing, so pullHourly must be false.
  pullHourly: false,
  methodology,
};

export default adapter;
