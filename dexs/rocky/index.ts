import { CHAIN } from "../../helpers/chains";
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

/*
 * Rocky Exchange — Canton Network perpetual + spot DEX (volume + fees).
 *
 * Source (public, unauthenticated, Binance-compatible market-data):
 *   Perp:   https://api.rocky.exchange/fapi/v1/ticker/24hr
 *   Spot:   https://api.rocky.exchange/api/v3/ticker/24hr
 *
 * Both endpoints return a rolling 24-hour aggregation across every symbol.
 * `quoteVolume` on each row is the USD-denominated notional (Rocky's spot
 * markets quote in USDCx/CUSD and perp markets quote in USD-pegged margin
 * assets, so `quoteVolume` is directly USD).
 *
 * runAtCurrTime: true — Rocky's Binance-compat tickers expose a live rolling
 * 24h window only; there is no historical time-travel endpoint. This matches
 * the same posture as pool-party (also Canton) which uses the same period=24h
 * convention.
 */

const API_BASE = "https://api.rocky.exchange";
const PERP_TICKER_URL = `${API_BASE}/fapi/v1/ticker/24hr`;
const SPOT_TICKER_URL = `${API_BASE}/api/v3/ticker/24hr`;

// Rocky internal-ledger fee schedule (source: rocky-backend
// services/internal-ledger/src/fees.rs).
const MAKER_FEE_BPS = 1;
const TAKER_FEE_BPS = 5;
const BPS = 10_000;

// USD-pegged quote assets on Rocky. `quoteVolume` in a ticker row is
// denominated in the quote asset, so summing across markets only produces a
// USD figure for USD-quoted pairs. Non-USD-quoted pairs (e.g. CETH-CBTC where
// the quote is CBTC) are excluded — they would need a price feed to convert.
const USD_QUOTE_ASSETS = new Set(["CUSD", "USDCX", "USDC", "USDT"]);

const quoteAsset = (symbol: string): string => {
  // Spot markets use `BASE-QUOTE` (e.g. CBTC-CUSD); perp uses concatenated
  // Binance-style (e.g. BTCUSDT). Handle both.
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
  if (!Array.isArray(rows)) {
    throw new Error("Rocky ticker/24hr response was not an array");
  }
  let total = 0;
  for (const row of rows as Ticker24hRow[]) {
    if (!USD_QUOTE_ASSETS.has(quoteAsset(row?.symbol || ""))) continue;
    const v = Number(row?.quoteVolume);
    if (!Number.isFinite(v) || v < 0) {
      throw new Error(
        `Rocky ticker/24hr row has invalid quoteVolume for symbol=${row?.symbol}`,
      );
    }
    total += v;
  }
  return total;
};

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const [perpRows, spotRows] = await Promise.all([
    fetchURL(PERP_TICKER_URL),
    fetchURL(SPOT_TICKER_URL),
  ]);

  const dailyVolume = sumUsdQuoteVolume(perpRows) + sumUsdQuoteVolume(spotRows);

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(
    (dailyVolume * MAKER_FEE_BPS) / BPS,
    "Maker Fees",
  );
  dailyFees.addUSDValue(
    (dailyVolume * TAKER_FEE_BPS) / BPS,
    "Taker Fees",
  );

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailySupplySideRevenue: 0,
  };
};

const methodology = {
  Volume:
    "Sum of `quoteVolume` for every USD-quoted symbol returned by Rocky's Binance-compatible 24h ticker endpoints — perpetual futures at /fapi/v1/ticker/24hr and spot at /api/v3/ticker/24hr. USD-quoted means the quote asset is CUSD, USDCx, USDC, or USDT — all USD-pegged on Rocky, so `quoteVolume` is directly USD notional and the sum requires no external price conversion. Non-USD-quoted markets (e.g. CETH-CBTC) are excluded because their volume would need a live price feed to convert; today they are <0.01% of total volume.",
  Fees:
    "Trading fees charged by Rocky's internal ledger: 1 bps maker + 5 bps taker (= 6 bps aggregate) applied to the same 24h volume figure. Rate source: rocky-backend services/internal-ledger/src/fees.rs.",
  Revenue: "100% of trading fees accrue to the protocol.",
  ProtocolRevenue: "100% of trading fees accrue to the protocol.",
  SupplySideRevenue:
    "Zero. Rocky has no LP vault or affiliate fee-share program today, so no portion of the fee stream is paid to a supply side.",
};

const breakdownMethodology = {
  Fees: {
    "Maker Fees": "1 bps maker fee applied to 24h volume.",
    "Taker Fees": "5 bps taker fee applied to 24h volume.",
  },
  Revenue: {
    "Maker Fees": "1 bps maker fee applied to 24h volume.",
    "Taker Fees": "5 bps taker fee applied to 24h volume.",
  },
  ProtocolRevenue: {
    "Maker Fees": "1 bps maker fee applied to 24h volume.",
    "Taker Fees": "5 bps taker fee applied to 24h volume.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  adapter: {
    [CHAIN.CANTON]: {
      runAtCurrTime: true,
      start: "2026-07-01",
      meta: {
        methodology,
        breakdownMethodology,
      },
    },
  },
};

export default adapter;
