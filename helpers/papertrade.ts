import { FetchOptions } from "../adapters/types";
import { httpGet } from "../utils/fetchURL";

// Papertrade: synthetic BTC/ETH perps on HyperEVM, every position is against the protocol-owned LP at Hyperliquid's BBO mid.
// Source: the API behind https://exchange.papertrade.xyz/stats. HyperEVM contracts, in case it needs an on-chain rebuild:
//   Exchange (proxy) 0x6cd5661646289fb6e65ea5c032310fded797d0a2, PaperToken 0xe40f17915daa230324030003a197cdaef2261c0e,
//   PaperStaking 0xaad6c7b0cc3014fc80ffedae0ed7ce5967b0f016, DepositProxyFactory 0x1629b7d46bef6e13ff754174fc9f32dea309b38f
export const PAPERTRADE_API = "https://exchange.papertrade.xyz";

// Both history endpoints take only `interval` (1m, 1h, 1d), no from/to. A bucket starting at t holds the state at
// t + interval. The hourly series keeps about a week, the daily series the full history.
const INTERVALS = ["1h", "1d"];

type ProtocolHistory = {
  startMs: number;
  intervalMs: number;
  columns: Record<string, (number | null)[]>;
  source: { asOfMs: number };
};

type HouseHistory = {
  baseTimeMs: number;
  intervalMs: number;
  timeOffsetsMs: number[];
  columns: Record<string, (number | null)[]>;
  source: { asOfMs: number };
};

// the runner's logical window is [startTimestamp + 1, endTimestamp)
const windowOf = (options: FetchOptions) => ({ startMs: (options.startTimestamp + 1) * 1000, endMs: options.endTimestamp * 1000 });

// index of the bucket holding the counter at instant tMs; -1 = before genesis (0, daily series only); undefined = cannot answer
function bucketEndingAt(h: ProtocolHistory, tMs: number, length: number): number | undefined {
  if (h.source.asOfMs < tMs) return undefined;
  const idx = (tMs - h.startMs) / h.intervalMs - 1;
  if (!Number.isInteger(idx) || idx >= length) return undefined;
  if (idx < 0) return h.intervalMs === 86400 * 1000 && idx === -1 ? -1 : undefined;
  return idx;
}

// /query/protocol/history: cumulative USD counters (volume, stakingRewards, users, ...); returns end minus start of the
// window. Counters are monotonic except the ones listed in signedKeys (traderPnl), which may go either way.
export async function getProtocolWindowDeltas(options: FetchOptions, keys: string[], signedKeys: string[] = []): Promise<Record<string, number>> {
  const { startMs, endMs } = windowOf(options);
  for (const interval of INTERVALS) {
    const h: ProtocolHistory = await httpGet(`${PAPERTRADE_API}/query/protocol/history?interval=${interval}`);
    const length = h.columns[keys[0]]?.length ?? 0;
    const from = bucketEndingAt(h, startMs, length);
    const to = bucketEndingAt(h, endMs, length);
    if (from === undefined || to === undefined) continue;
    const out: Record<string, number> = {};
    for (const key of keys) {
      const col = h.columns[key];
      const cur = col?.[to];
      const prev = from === -1 ? 0 : col?.[from];
      if (cur == null || prev == null) throw new Error(`papertrade: ${key} is null in the ${interval} series for ${options.dateString}`);
      const delta = cur - prev;
      if (signedKeys.includes(key)) { out[key] = delta; continue; }
      if (delta < -1e-6) throw new Error(`papertrade: cumulative ${key} went down in the ${interval} series for ${options.dateString}`);
      out[key] = Math.max(delta, 0); // float noise on an unchanged counter
    }
    return out;
  }
  throw new Error(`papertrade: no final ${new Date(startMs).toISOString()} - ${new Date(endMs).toISOString()} window in the hourly or daily series`);
}

// /query/house/history: house book snapshots (bl/bs, el/es = BTC/ETH long/short entry notional in USD, lp = LP balance); window end
export async function getHouseSnapshotAtEnd(options: FetchOptions, keys: string[]): Promise<Record<string, number>> {
  const { endMs } = windowOf(options);
  for (const interval of INTERVALS) {
    const h: HouseHistory = await httpGet(`${PAPERTRADE_API}/query/house/history?interval=${interval}`);
    if (h.source.asOfMs < endMs - 1000) continue;
    const idx = h.timeOffsetsMs.findIndex((offset) => h.baseTimeMs + offset === endMs - h.intervalMs);
    if (idx < 0) continue;
    const out: Record<string, number> = {};
    for (const key of keys) {
      const value = h.columns[key]?.[idx];
      if (value == null) throw new Error(`papertrade: ${key} is null in the ${interval} house series for ${options.dateString}`);
      out[key] = value;
    }
    return out;
  }
  throw new Error(`papertrade: no final house snapshot at ${new Date(endMs).toISOString()} in the hourly or daily series`);
}

export async function getOpenInterestAtEnd(options: FetchOptions) {
  const { bl, bs, el, es } = await getHouseSnapshotAtEnd(options, ["bl", "bs", "el", "es"]);
  // every position is against the house, so longs and shorts add up (same as the stats page)
  const longOpenInterestAtEnd = bl + el;
  const shortOpenInterestAtEnd = bs + es;
  return { openInterestAtEnd: longOpenInterestAtEnd + shortOpenInterestAtEnd, longOpenInterestAtEnd, shortOpenInterestAtEnd };
}
