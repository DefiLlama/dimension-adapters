import PromisePool from "@supercharge/promise-pool";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL, { fetchURLAutoHandleRateLimit } from "../utils/fetchURL";

type Market = { eventName?: string; yesSymbolName?: string; noSymbolName?: string; tradingStartTime?: number; tradingCloseTime?: number | null; windowEndTime?: number | null };
type Ticker = { symbol?: string; openTime?: number; closeTime?: number };
type Kline = [number, string, string, string, string, string, number, string];
type KlineResponse = Record<string, any> & { code?: number; msg?: string };
type Req = { eventName: string; symbol: string; from: number; to: number };

const EVENTS_API = "https://www.asterdex.com/bapi/asset/v1/public/spot/prediction/events";
const TICKER_API = "https://papi.asterdex.com/api/v3/ticker/24hr";
const KLINES_API = "https://papi.asterdex.com/api/v3/prediction/klines";
const DAY_MS = 24 * 60 * 60 * 1000;
const CHUNK_MS = 1500 * 1000;

const chunk = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

const overlaps = (a: number, b: number, x: number, y: number) => a < y && b > x;
const volume = (rows: Kline[], start: number, end: number) =>
  rows.filter((row) => row[0] >= start && row[0] < end).reduce((sum, row) => sum + Number(row[7] || 0), 0);
const isPredictionTicker = (symbol: string) => symbol.includes("_UP_DOWN_") || /^EVENT\d+_/.test(symbol);
const getRollingEvent = (symbol: string) => symbol.match(/^(.+)_\d+_[YN]USDT$/)?.[1];

const getRequests = async (start: number, end: number) => {
  const [eventsRes, tickers] = await Promise.all([
    fetchURL(EVENTS_API) as Promise<{ data?: { markets?: Market[] }[] }>,
    fetchURL(TICKER_API) as Promise<Ticker[]>,
  ]);
  const grouped = new Map<string, Req[]>(), seen = new Set<string>();
  const add = (eventName?: string, symbol?: string, from = 0, to = 0) => {
    const key = `${eventName}:${symbol}`;
    if (!eventName || !symbol || to <= from || seen.has(key)) return;
    seen.add(key);
    grouped.set(eventName, [...(grouped.get(eventName) || []), { eventName, symbol, from, to }]);
  };

  eventsRes.data?.forEach((event) => event.markets?.forEach((market) => {
    if (!market.eventName || market.eventName.includes("_UP_DOWN_")) return;
    const from = market.tradingStartTime || start;
    const to = market.tradingCloseTime || market.windowEndTime || end;
    if (!overlaps(from, to, start, end)) return;
    add(market.eventName, market.yesSymbolName, Math.max(from, start), Math.min(to, end));
    add(market.eventName, market.noSymbolName, Math.max(from, start), Math.min(to, end));
  }));

  tickers.forEach((ticker) => {
    if (!ticker.symbol || !ticker.openTime || !ticker.closeTime || !isPredictionTicker(ticker.symbol)) return;
    if (!overlaps(ticker.openTime, ticker.closeTime + 1, start, end)) return;
    add(getRollingEvent(ticker.symbol), ticker.symbol, Math.max(ticker.openTime, start), Math.min(ticker.closeTime + 1, end));
  });

  return grouped;
};

const fetchKlines = async (eventName: string, symbols: string[], interval: string, start: number, end: number) => {
  const url = `${KLINES_API}?event=${encodeURIComponent(eventName)}&symbols=${symbols.join(",")}&interval=${interval}&startTime=${start}&endTime=${end - 1}&limit=1500`;
  const res = await fetchURLAutoHandleRateLimit(url) as KlineResponse;
  if (res.code && res.msg !== "Invalid interval.") throw new Error(`Aster kline error for ${eventName}: ${res.msg}`);
  return res;
};

const fetchFallbackVolume = async (req: Req) => {
  let total = 0;
  for (let from = req.from; from < req.to; from += CHUNK_MS) {
    const to = Math.min(req.to, from + CHUNK_MS);
    const res = await fetchKlines(req.eventName, [req.symbol], "1s", from, to);
    const rows = res[req.symbol];
    if (Array.isArray(rows)) total += volume(rows, req.from, req.to);
  }
  return total;
};

const fetchEventVolume = async ([eventName, reqs]: [string, Req[]], start: number, end: number) => {
  if (eventName.includes("_UP_DOWN_")) {
    const { results } = await PromisePool.withConcurrency(2).for(reqs).process(fetchFallbackVolume);
    return results.reduce((sum, value) => sum + value, 0);
  }

  let total = 0;
  for (const symbols of chunk(reqs.map((req) => req.symbol), 100)) {
    const res = await fetchKlines(eventName, symbols, "1d", start, end);
    if (!res.code) Object.values(res).forEach((rows) => {
      if (Array.isArray(rows)) total += volume(rows, start, end);
    });
  }
  return total;
};

const fetch = async (options: FetchOptions) => {
  const start = options.startOfDay * 1000;
  const end = start + DAY_MS;
  const { results } = await PromisePool.withConcurrency(2).for(Array.from(await getRequests(start, end))).process((entry) => fetchEventVolume(entry, start, end));
  return { dailyVolume: results.reduce((sum, value) => sum + value, 0) };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  start: "2026-06-02",
  chains: [CHAIN.OFF_CHAIN],
};

export default adapter;
