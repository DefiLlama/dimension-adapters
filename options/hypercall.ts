import PromisePool from "@supercharge/promise-pool";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet, httpPost } from "../utils/fetchURL";

// Hypercall matches options off-chain and custodies collateral in its HyperCore account, so its public API is the
// trade source (option tokens are not deployed on HyperEVM). One row per fill, newest first, max 1000 rows per page.
const TRADES_API = "https://api.hypercall.xyz/trades";
const PAGE_SIZE = 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

type HypercallTrade = {
  trade_id: number;
  symbol: string; // UNDERLYING-YYYYMMDD-STRIKE-C|P, e.g. SP500-20260924-7600-P
  price: string; // premium per contract in USD
  size: string; // contracts, one contract = one unit of the underlying
  timestamp: number; // ms
};

type Candle = { t: number; T: number; o: string };

async function getTrades(fromMs: number, toMs: number): Promise<HypercallTrade[]> {
  const trades = new Map<number, HypercallTrade>(); // keyed by trade_id: new fills shift offsets, so pages can overlap
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { success, data } = await httpGet(`${TRADES_API}?limit=${PAGE_SIZE}&offset=${offset}`);
    if (!success || !Array.isArray(data)) throw new Error(`Hypercall trades: bad response at offset ${offset}`);
    for (const trade of data) if (trade.timestamp >= fromMs && trade.timestamp < toMs) trades.set(trade.trade_id, trade);
    if (data.length < PAGE_SIZE || data[data.length - 1].timestamp < fromMs) break;
  }
  return [...trades.values()];
}

// Hypercall underlyings trade as Hyperliquid perps: BTC/ETH on the main dex, equities and indices on trade.xyz (HIP-3)
const hyperliquidCoin = (underlying: string) => (["BTC", "ETH"].includes(underlying) ? underlying : `xyz:${underlying}`);

// Hyperliquid only serves the latest 5000 candles per interval (~208 days of 1h, ~13 years of 1d):
// https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint#candle-snapshot
const getCandles = async (underlying: string, interval: "1h" | "1d", fromMs: number, toMs: number): Promise<Candle[]> =>
  (await httpPost("https://api.hyperliquid.xyz/info", {
    type: "candleSnapshot",
    req: { coin: hyperliquidCoin(underlying), interval, startTime: fromMs, endTime: toMs },
  })) ?? [];

const findCandle = (candles: Candle[], timestamp: number) => candles.find((c) => c.t <= timestamp && timestamp <= c.T);

const fetch = async (options: FetchOptions) => {
  const dailyNotionalVolume = options.createBalances();
  const dailyPremiumVolume = options.createBalances();
  // consecutive runner windows share their boundary second (start = previous end - 1), so skip it to avoid double counting
  const fromMs = (options.startTimestamp + 1) * 1000;
  const toMs = options.endTimestamp * 1000;

  const trades = await getTrades(fromMs, toMs);
  const underlyings = [...new Set(trades.map((t) => t.symbol.split("-")[0]))];
  const hourly: Record<string, Candle[]> = {};
  const daily: Record<string, Candle[]> = {};
  // low concurrency: the Hyperliquid info endpoint is rate limited
  const { errors } = await PromisePool.withConcurrency(3)
    .for(underlyings)
    .process(async (underlying) => {
      hourly[underlying] = await getCandles(underlying, "1h", fromMs - HOUR_MS, toMs);
    });
  if (errors.length) throw errors[0].raw ?? errors[0];

  for (const trade of trades) {
    const underlying = trade.symbol.split("-")[0];
    let candle = findCandle(hourly[underlying], trade.timestamp);
    if (!candle) {
      // hourly candles for this hour have aged out (refills older than ~208 days), price off the daily open instead
      daily[underlying] ??= await getCandles(underlying, "1d", fromMs - DAY_MS, toMs);
      candle = findCandle(daily[underlying], trade.timestamp);
    }
    if (!candle) throw new Error(`Hypercall: no ${hyperliquidCoin(underlying)} candle for trade ${trade.trade_id}`);
    const size = Number(trade.size);
    dailyNotionalVolume.addUSDValue(size * Number(candle.o));
    dailyPremiumVolume.addUSDValue(size * Number(trade.price));
  }

  return { dailyNotionalVolume, dailyPremiumVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.OFF_CHAIN], // matching is off-chain; collateral sits in Hypercall's HyperCore account
  start: "2026-06-01", // mainnet launch, first trade 2026-06-01T19:55Z
  methodology: {
    NotionalVolume: "Contracts traded on Hypercall times the underlying price, taken as the open of the Hyperliquid 1h candle (BTC/ETH perps, trade.xyz perps for equities and indices) containing the trade, or of the 1d candle once hourly candles are no longer served. Each fill is counted once.",
    PremiumVolume: "Contracts traded on Hypercall times the option premium paid. Each fill is counted once.",
  },
};

export default adapter;
