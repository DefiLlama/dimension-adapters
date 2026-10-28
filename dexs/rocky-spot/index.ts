import { CHAIN } from "../../helpers/chains";
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

/*
 * Rocky Exchange — Canton Network spot orderbook DEX (volume + fees).
 *
 * Sibling adapter: dexs/rocky-perp/index.ts (perpetual futures).
 *
 * Source (public, unauthenticated, Binance-compatible spot market-data):
 *   https://api.rocky.exchange/api/v3/ticker/24hr
 *
 * Returns a rolling 24-hour aggregation across every spot symbol.
 * `quoteVolume` on each row is USD-denominated for USD-quoted markets
 * (Rocky's spot markets quote in USD-pegged assets — currently USDCB/USX,
 * previously CUSD/USDCx), so summing USD-quoted rows directly yields USD
 * notional.
 *
 * runAtCurrTime + pullHourly:false — Rocky's Binance-compat ticker exposes a
 * live rolling 24h window only; there is no historical time-travel or
 * per-hour bucketing. Same posture as dexs/pool-party (also Canton).
 */

const SPOT_TICKER_URL = "https://api.rocky.exchange/api/v3/ticker/24hr";

// USD-pegged quote assets on Rocky. `quoteVolume` in a ticker row is
// denominated in the quote asset, so summing across markets only produces a
// USD figure for USD-quoted pairs. Non-USD-quoted pairs (e.g. CETH-CBTC where
// the quote is CBTC) are excluded — they would need a price feed to convert.
const USD_QUOTE_ASSETS = new Set(["CUSD", "USDCX", "USDC", "USDT", "USDCB", "USX"]);

const quoteAsset = (symbol: string): string => {
  // Spot markets use `BASE-QUOTE` (e.g. CBTC-CUSD).
  if (symbol.includes("-")) return symbol.split("-").pop()!.toUpperCase();
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
    throw new Error("Rocky spot ticker/24hr returned empty or non-array payload");
  }
  let total = 0;
  let usdQuotedRowCount = 0;
  for (const row of rows as Ticker24hRow[]) {
    const symbol = typeof row?.symbol === "string" ? row.symbol.trim() : "";
    if (!symbol) {
      throw new Error("Rocky spot ticker/24hr row missing symbol");
    }
    if (!USD_QUOTE_ASSETS.has(quoteAsset(symbol))) continue;
    const rawVolume = typeof row?.quoteVolume === "string" ? row.quoteVolume.trim() : "";
    if (rawVolume.length === 0) {
      throw new Error(`Rocky spot ticker/24hr row ${symbol} missing quoteVolume`);
    }
    const v = Number(rawVolume);
    if (!Number.isFinite(v) || v < 0) {
      throw new Error(`Rocky spot ticker/24hr row ${symbol} invalid quoteVolume=${rawVolume}`);
    }
    total += v;
    usdQuotedRowCount += 1;
  }
  if (usdQuotedRowCount === 0) {
    throw new Error("Rocky spot ticker/24hr returned no USD-quoted rows");
  }
  return total;
};

const fetch = async (_options: FetchOptions): Promise<FetchResult> => {
  const rows = await fetchURL(SPOT_TICKER_URL);
  const dailyVolume = sumUsdQuoteVolume(rows);

  return {
    dailyVolume,
  };
};

const methodology = {
  Volume:
    "Sum of `quoteVolume` for every USD-quoted spot symbol returned by Rocky's Binance-compatible 24h ticker endpoint at /api/v3/ticker/24hr. USD-quoted means the quote asset is USDCB, USX, CUSD, USDCx, USDC, or USDT — all USD-pegged on Rocky, so `quoteVolume` is directly USD notional and the sum requires no external price conversion. Non-USD-quoted spot markets (e.g. CETH-CBTC) are excluded because their volume would need a live price feed to convert; today they are <0.01% of total spot volume.",
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
