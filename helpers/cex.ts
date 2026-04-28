import { httpGet } from "../utils/fetchURL";

// Shared utilities for centralized exchange adapters.
// Each exchange exports a function that returns spot volume,
// derivatives volume, and open interest, all in USD.
// To add new exchange: implement a function matching the CexVolumeResult
// signature and add it here.

export type CexVolumeResult = {
  dailySpotVolume: number;
  dailyDerivativesVolume: number;
  openInterest: number;
};

/** Sum values from an array, skipping NaN/Infinity results. */
export function sumField<T>(items: T[], transform: (item: T) => number): number {
  let total = 0;
  for (const item of items) {
    const val = transform(item);
    if (Number.isFinite(val)) total += val;
  }
  return total;
}

const STABLECOINS = ["USDT", "USDC", "BUSD", "FDUSD", "DAI"];

// ─── Binance ────────────────────────────────────────────────────────────────────

const BINANCE_SPOT = "https://api.binance.com/api/v3/ticker/24hr";
const BINANCE_USDM = "https://fapi.binance.com/fapi/v1/ticker/24hr";
const BINANCE_COINM = "https://dapi.binance.com/dapi/v1/ticker/24hr";

type BinanceSpotTicker = { symbol: string; quoteVolume: string; volume: string };
type BinanceFuturesTicker = {
  symbol: string;
  quoteVolume: string;
  baseVolume: string;
  lastPrice: string;
};

export async function fetchBinance(): Promise<CexVolumeResult> {
  const [spotData, usdmData, coinmData] = await Promise.all([
    httpGet(BINANCE_SPOT) as Promise<BinanceSpotTicker[]>,
    httpGet(BINANCE_USDM) as Promise<BinanceFuturesTicker[]>,
    httpGet(BINANCE_COINM) as Promise<BinanceFuturesTicker[]>,
  ]);

  // Build price map from USDT spot pairs for cross-converting non-USDT quotes
  const prices: Record<string, number> = {};
  for (const t of spotData) {
    if (t.symbol.endsWith("USDT") && Number(t.volume) > 0) {
      prices[t.symbol.slice(0, -4)] = Number(t.quoteVolume) / Number(t.volume);
    }
  }
  for (const s of STABLECOINS) prices[s] = 1;

  // Spot volume: convert all quote volumes to USD
  const dailySpotVolume = sumField(spotData, (t) => {
    const quoteVol = Number(t.quoteVolume);
    for (const s of STABLECOINS) {
      if (t.symbol.endsWith(s)) return quoteVol;
    }
    for (const q of ["BTC", "ETH", "BNB"]) {
      if (t.symbol.endsWith(q)) return quoteVol * (prices[q] || 0);
    }
    return 0;
  });

  // USDT-M futures: quoteVolume is already in USDT
  const usdmVolume = sumField(usdmData, (t) => Number(t.quoteVolume));

  // COIN-M futures: baseVolume is in base asset × lastPrice for USD
  const coinmVolume = sumField(coinmData, (t) => Number(t.baseVolume) * Number(t.lastPrice));

  // ── Open Interest ──
  let openInterest = 0;

  // USDT-M OI: must call /fapi/v1/openInterest per symbol (no batch endpoint).
  // Fetch mark prices first, then query top 80 symbols by volume.
  try {
    const premiumData = await httpGet("https://fapi.binance.com/fapi/v1/premiumIndex") as Array<{
      symbol: string;
      markPrice: string;
    }>;
    const markPrices: Record<string, number> = {};
    for (const p of premiumData) markPrices[p.symbol] = Number(p.markPrice);

    const topUsdm = [...usdmData]
      .sort((a, b) => Number(b.quoteVolume) - Number(a.quoteVolume))
      .slice(0, 80);

    const oiResults = await Promise.all(
      topUsdm.map(async (t) => {
        try {
          const oi = await httpGet(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${t.symbol}`) as {
            openInterest: string;
          };
          // OI is in base asset units — multiply by mark price for USD notional
          return Number(oi.openInterest) * (markPrices[t.symbol] || Number(t.lastPrice));
        } catch {
          return 0;
        }
      })
    );
    openInterest += oiResults.reduce((a, b) => a + b, 0);
  } catch { /* USDT-M OI fetch failed */ }

  // COIN-M OI: inverse contracts with fixed USD face value per contract.
  // contractSize from exchangeInfo gives USD value per contract.
  try {
    const exchangeInfo = await httpGet("https://dapi.binance.com/dapi/v1/exchangeInfo") as {
      symbols: Array<{ symbol: string; contractSize: number }>;
    };
    const contractSizes: Record<string, number> = {};
    for (const s of exchangeInfo.symbols) contractSizes[s.symbol] = s.contractSize;

    const topCoinm = [...coinmData]
      .sort((a, b) => Number(b.baseVolume) - Number(a.baseVolume))
      .slice(0, 30);

    const coinmOiResults = await Promise.all(
      topCoinm.map(async (t) => {
        try {
          const oi = await httpGet(`https://dapi.binance.com/dapi/v1/openInterest?symbol=${t.symbol}`) as {
            openInterest: string;
          };
          // Inverse: notional USD = contracts × contractSize (USD face value)
          return Number(oi.openInterest) * (contractSizes[t.symbol] || 10);
        } catch {
          return 0;
        }
      })
    );
    openInterest += coinmOiResults.reduce((a, b) => a + b, 0);
  } catch { /* COIN-M OI fetch failed */ }

  return { dailySpotVolume, dailyDerivativesVolume: usdmVolume + coinmVolume, openInterest };
}

// ─── Bybit ──────────────────────────────────────────────────────────────────────

const BYBIT_TICKERS = "https://api.bybit.com/v5/market/tickers";

type BybitTicker = {
  symbol: string;
  turnover24h: string;
  openInterestValue?: string;
  lastPrice: string;
};

type BybitResponse = {
  retCode: number;
  result: { list: BybitTicker[] };
};

async function fetchBybitCategory(category: string): Promise<BybitTicker[]> {
  const resp = await httpGet(`${BYBIT_TICKERS}?category=${category}`) as BybitResponse;
  return resp.result?.list ?? [];
}

export async function fetchBybit(): Promise<CexVolumeResult> {
  const [spot, linear, inverse] = await Promise.all([
    fetchBybitCategory("spot"),
    fetchBybitCategory("linear"),
    fetchBybitCategory("inverse"),
  ]);

  // Spot: turnover24h is in quote currency (USD for USDT/USDC pairs)
  const spotPrices: Record<string, number> = {};
  for (const t of spot) {
    if (t.symbol.endsWith("USDT")) {
      spotPrices[t.symbol.replace("USDT", "")] = Number(t.lastPrice);
    }
  }

  const dailySpotVolume = sumField(spot, (t) => {
    const turnover = Number(t.turnover24h);
    if (t.symbol.endsWith("USDT") || t.symbol.endsWith("USDC")) return turnover;
    if (t.symbol.endsWith("BTC")) return turnover * (spotPrices["BTC"] || 0);
    if (t.symbol.endsWith("ETH")) return turnover * (spotPrices["ETH"] || 0);
    return 0;
  });

  // Linear perps: turnover24h is in USDT
  const linearVolume = sumField(linear, (t) => Number(t.turnover24h));

  // Inverse perps: turnover24h is in base asset, convert via lastPrice
  const inverseVolume = sumField(inverse, (t) => Number(t.turnover24h) * Number(t.lastPrice));

  // OI: both linear and inverse provide openInterestValue in USD
  const openInterest =
    sumField(linear, (t) => Number(t.openInterestValue || 0)) +
    sumField(inverse, (t) => Number(t.openInterestValue || 0));

  return { dailySpotVolume, dailyDerivativesVolume: linearVolume + inverseVolume, openInterest };
}

// ─── OKX ────────────────────────────────────────────────────────────────────────

const OKX_TICKERS = "https://www.okx.com/api/v5/market/tickers";
const OKX_OI = "https://www.okx.com/api/v5/public/open-interest";

type OkxTicker = {
  instId: string;
  vol24h: string;
  volCcy24h: string;
  last: string;
};

type OkxOiItem = {
  instId: string;
  oiUsd: string;
};

type OkxResponse<T> = { code: string; data: T[] };

export async function fetchOkx(): Promise<CexVolumeResult> {
  const [spotData, swapData, futuresData, swapOi, futuresOi] = await Promise.all([
    httpGet(`${OKX_TICKERS}?instType=SPOT`) as Promise<OkxResponse<OkxTicker>>,
    httpGet(`${OKX_TICKERS}?instType=SWAP`) as Promise<OkxResponse<OkxTicker>>,
    httpGet(`${OKX_TICKERS}?instType=FUTURES`) as Promise<OkxResponse<OkxTicker>>,
    httpGet(`${OKX_OI}?instType=SWAP`) as Promise<OkxResponse<OkxOiItem>>,
    httpGet(`${OKX_OI}?instType=FUTURES`) as Promise<OkxResponse<OkxOiItem>>,
  ]);

  // Spot: volCcy24h is in quote currency. For -USDT/-USDC pairs, this is USD.
  const spotPrices: Record<string, number> = {};
  for (const t of spotData.data) {
    if (t.instId.endsWith("-USDT")) spotPrices[t.instId.split("-")[0]] = Number(t.last);
  }

  const dailySpotVolume = sumField(spotData.data, (t) => {
    if (t.instId.endsWith("-USDT") || t.instId.endsWith("-USDC")) return Number(t.volCcy24h);
    // Non-stablecoin quote: use base volume × price
    const base = t.instId.split("-")[0];
    return Number(t.vol24h) * (spotPrices[base] || 0);
  });

  // Derivatives: volCcy24h is in base currency, multiply by last price for USD
  const derivsVolume = (data: OkxTicker[]) =>
    sumField(data, (t) => Number(t.volCcy24h) * Number(t.last));

  const dailyDerivativesVolume = derivsVolume(swapData.data) + derivsVolume(futuresData.data);

  // OI: oiUsd is directly in USD
  const openInterest =
    sumField(swapOi.data, (t) => Number(t.oiUsd)) +
    sumField(futuresOi.data, (t) => Number(t.oiUsd));

  return { dailySpotVolume, dailyDerivativesVolume, openInterest };
}
