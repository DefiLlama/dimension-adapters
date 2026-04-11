import ccxt, { Exchange } from "ccxt";
import PromisePool from "@supercharge/promise-pool";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

let exchange: Exchange | null = null;

function getExchange(): Exchange {
  if (!exchange) {
    exchange = new ccxt.deribit({ enableRateLimit: true });
  }
  return exchange;
}

const RETRYABLE_ERRORS = new Set([
  "RateLimitExceeded",
  "DDoSProtection",
  "RequestTimeout",
  "ExchangeNotAvailable",
  "NetworkError",
]);

async function fetchWithRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      const errorName = e?.constructor?.name ?? "";
      if (!RETRYABLE_ERRORS.has(errorName)) return null;
      if (attempt === retries) return null;
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
  return null;
}

interface KlineResult {
  quoteVolume: number;
  close: number;
}

// Deribit doesn't expose quoteVolume in its OHLCV response (only 6 fields via CCXT).
// All spot pairs are stablecoin-quoted (USDC/USDE) so baseVol * close ≈ USD volume.
// Deribit daily candles open at 08:00 UTC, so we check the candle falls on the same
// calendar day rather than requiring an exact timestamp match.
async function fetchKline(ex: Exchange, symbol: string, sinceMs: number): Promise<KlineResult | null> {
  const candles = await ex.fetchOHLCV(symbol, "1d", sinceMs, 1);
  if (!candles?.length) return null;
  const [openTime, , , , close, baseVol] = candles[0];
  const ONE_DAY_MS = 86400000;
  if (Math.abs((openTime ?? 0) - sinceMs) >= ONE_DAY_MS) return null;
  return { quoteVolume: (baseVol ?? 0) * (close ?? 0), close: close ?? 0 };
}

const debug = !!process.env.DEBUG_BREAKDOWN_FEES;
const STABLECOIN_QUOTES = new Set(["USDT", "USDC", "BUSD", "FDUSD", "TUSD", "DAI", "USD", "USDE"]);

function logProgress(done: number, total: number, failed: number) {
  if (!debug) return;
  const pct = ((done / total) * 100).toFixed(1);
  const bar = "█".repeat(Math.floor(done / total * 30)).padEnd(30, "░");
  process.stdout.write(`\r[deribit] ${bar} ${pct}% (${done}/${total}, ${failed} failed)`);
  if (done === total) process.stdout.write("\n");
}

const fetch = async (_ts: number, _: any, options: FetchOptions) => {
  const ex = getExchange();
  await ex.loadMarkets();

  const allSpot = Object.values(ex.markets).filter((m) => m.type === "spot");
  const markets = allSpot.filter((m) => m.active !== false);
  const sinceMs = options.startOfDay * 1000;
  let done = 0;
  let failed = 0;

  const results: { symbol: string; quote: string; quoteVol: number; close: number }[] = [];

  if (debug) {
    const skippedInactive = allSpot.length - markets.length;
    console.log(`[deribit] Fetching spot OHLCV for ${markets.length} active markets (${skippedInactive} inactive skipped) (date: ${options.dateString})`);
  }

  const failedMarkets: string[] = [];

  await PromisePool.withConcurrency(5)
    .for(markets)
    .process(async (market) => {
      const kline = await fetchWithRetry(() => fetchKline(ex, market.symbol, sinceMs));
      if (kline === null) {
        failed++;
        failedMarkets.push(market.symbol);
      } else if (kline.quoteVolume > 0) {
        results.push({ symbol: market.symbol, quote: market.quote, quoteVol: kline.quoteVolume, close: kline.close });
      }
      done++;
      logProgress(done, markets.length, failed);
    });

  if (failedMarkets.length > 0) {
    console.log(`[deribit-spot] ${failedMarkets.length} markets failed: ${failedMarkets.join(", ")}`);
  }

  // --- USD price map ---
  // Deribit spot pairs are quoted in USDC/USDE (stablecoins ≈ $1).
  // For non-stablecoin quotes, derive price from stablecoin pairs or stablecoin/fiat pairs.
  const quotePriceUsd: Record<string, number> = {};
  const quotePriceVol: Record<string, number> = {};
  for (const s of STABLECOIN_QUOTES) quotePriceUsd[s] = 1;

  for (const r of results) {
    if (r.close <= 0) continue;
    const base = r.symbol.split("/")[0];
    if (STABLECOIN_QUOTES.has(r.quote)) {
      if (!quotePriceUsd[base] || r.quoteVol > (quotePriceVol[base] ?? 0)) {
        quotePriceUsd[base] = r.close;
        quotePriceVol[base] = r.quoteVol;
      }
    }
    if (STABLECOIN_QUOTES.has(base) && !STABLECOIN_QUOTES.has(r.quote) && !quotePriceUsd[r.quote]) {
      quotePriceUsd[r.quote] = 1 / r.close;
    }
  }

  let dailyVolume = 0;
  const pairVolumes: { symbol: string; vol: number }[] = [];
  const unknownQuotes = new Set<string>();

  for (const r of results) {
    const usdPrice = quotePriceUsd[r.quote];
    if (usdPrice === undefined) {
      unknownQuotes.add(r.quote);
      continue;
    }
    const volUsd = r.quoteVol * usdPrice;
    dailyVolume += volUsd;
    if (debug) pairVolumes.push({ symbol: r.symbol, vol: volUsd });
  }

  if (unknownQuotes.size > 0) {
    const skippedCount = results.filter((r) => unknownQuotes.has(r.quote)).length;
    console.log(`[deribit-spot] ${skippedCount} pairs skipped — no USD price for quotes: ${[...unknownQuotes].join(", ")}`);
  }

  if (debug) {
    pairVolumes.sort((a, b) => b.vol - a.vol);
    console.log(`[deribit] Top 20 pairs by volume:`);
    pairVolumes.slice(0, 20).forEach((p, i) =>
      console.log(`  ${String(i + 1).padStart(2)}. ${p.symbol.padEnd(16)} $${(p.vol / 1e6).toFixed(2)}M`),
    );
    console.log(`[deribit] Done — dailyVolume: $${(dailyVolume / 1e6).toFixed(2)}M`);
  }

  return { dailyVolume, timestamp: options.startOfDay };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.OFF_CHAIN]: {
      fetch,
      start: "2024-01-01",
    },
  },
};

export default adapter;
