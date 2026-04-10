import ccxt, { Exchange } from "ccxt";
import PromisePool from "@supercharge/promise-pool";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

let exchange: Exchange | null = null;

function getExchange(): Exchange {
  if (!exchange) {
    exchange = new ccxt.binance({ enableRateLimit: true });
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

// Calls Binance raw klines endpoint (publicGetKlines) instead of CCXT's fetchOHLCV,
// because fetchOHLCV strips the response to [ts, o, h, l, c, baseVol] and drops
// quoteVolume (index 7). The raw endpoint still goes through CCXT's rate limiter.
// Binance returns the first available candle if startTime predates the pair's listing.
// Verify the returned candle's open time (index 0) matches the requested day before using it.
async function fetchKline(ex: Exchange, marketId: string, sinceMs: number): Promise<KlineResult | null> {
  const klines = await (ex as any).publicGetKlines({
    symbol: marketId, interval: "1d", startTime: sinceMs, limit: 1,
  });
  if (!klines?.length) return null;
  const openTime = Number(klines[0][0]);
  if (openTime !== sinceMs) return null;
  return { quoteVolume: Number(klines[0][7]), close: Number(klines[0][4]) };
}

const debug = !!process.env.DEBUG_BREAKDOWN_FEES;
const STABLECOIN_QUOTES = new Set(["USDT", "USDC", "BUSD", "FDUSD", "TUSD", "DAI", "USD"]);

function logProgress(done: number, total: number, failed: number) {
  if (!debug) return;
  const pct = ((done / total) * 100).toFixed(1);
  const bar = "█".repeat(Math.floor(done / total * 30)).padEnd(30, "░");
  process.stdout.write(`\r[binance] ${bar} ${pct}% (${done}/${total}, ${failed} failed)`);
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
    console.log(`[binance] Fetching spot OHLCV for ${markets.length} active markets (${skippedInactive} inactive skipped) (date: ${options.dateString})`);
  }

  await PromisePool.withConcurrency(10)
    .for(markets)
    .process(async (market) => {
      const kline = await fetchWithRetry(() => fetchKline(ex, market.id, sinceMs));
      if (kline && kline.quoteVolume > 0) {
        results.push({ symbol: market.symbol, quote: market.quote, quoteVol: kline.quoteVolume, close: kline.close });
      } else {
        failed++;
      }
      done++;
      logProgress(done, markets.length, failed);
    });

  // --- USD price map ---
  // Pairs are quoted in various currencies (USDT, BTC, ETH, TRY, EUR, etc.).
  // To convert all quoteVolumes to USD:
  //   1) Stablecoins (USDT, USDC, ...) = $1
  //   2) Crypto quotes (BTC, ETH, BNB, ...): price derived from their highest-volume
  //      stablecoin pair, e.g. BTC/USDT close → 1 BTC = close USD
  //   3) Fiat quotes (TRY, BRL, JPY, ...): price derived from stablecoin/fiat pairs,
  //      e.g. USDT/TRY close = 38.5 → 1 TRY = 1/38.5 USD
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
    console.log(`[binance-spot] ${skippedCount} pairs skipped — no USD price for quotes: ${[...unknownQuotes].join(", ")}`);
  }

  if (debug) {
    pairVolumes.sort((a, b) => b.vol - a.vol);
    console.log(`[binance] Top 20 pairs by volume:`);
    pairVolumes.slice(0, 20).forEach((p, i) =>
      console.log(`  ${String(i + 1).padStart(2)}. ${p.symbol.padEnd(16)} $${(p.vol / 1e6).toFixed(2)}M`),
    );
    console.log(`[binance] Done — dailyVolume: $${(dailyVolume / 1e9).toFixed(2)}B`);
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.OFF_CHAIN],
  start: "2017-07-14",
};

export default adapter;
