import * as sdk from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { httpGet } from "../utils/fetchURL";
import { CHAIN } from "./chains";
import { getBlock } from "./getBlock";

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

// the runner's logical window is [startTimestamp + 1, endTimestamp); refills pass it a second short of the hour on both
// ends (22:59:59 to 23:59:59), so snap to the hour the series is bucketed on, but never move an end by more than a minute
const HOUR_MS = 3600 * 1000;
function alignToHour(ms: number) {
  const aligned = Math.round(ms / HOUR_MS) * HOUR_MS;
  if (Math.abs(aligned - ms) > 60 * 1000) throw new Error(`papertrade: window edge ${new Date(ms).toISOString()} is not on an hour`);
  return aligned;
}
const windowOf = (options: FetchOptions) => ({ startMs: alignToHour((options.startTimestamp + 1) * 1000), endMs: alignToHour(options.endTimestamp * 1000) });

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

//(https://docs.papertrade.xyz/how/builder-codes/).
const EXCHANGE = "0x6cd5661646289fb6e65ea5c032310fded797d0a2"; // HyperEVM
const BUILDER_FEES_ACCRUED = "event BuilderFeesAccrued(address indexed builder, address indexed user, uint256 amount)";
const usd = (x: bigint) => Number(x / 10n ** 12n) / 1e6;

export type PapertradeBuilderConfig = { builder: string; name: string; start: string };

export function papertradeBuilderFeesExports({ builder, name, start }: PapertradeBuilderConfig): SimpleAdapter {
  builder = builder.toLowerCase();
  const fetch = async (options: FetchOptions) => {
    const [fromBlock, toBlock] = await Promise.all([getBlock(options.fromTimestamp, CHAIN.HYPERLIQUID), getBlock(options.toTimestamp, CHAIN.HYPERLIQUID)]);
    const logs = await sdk.getEventLogs({ chain: CHAIN.HYPERLIQUID, target: EXCHANGE, fromBlock, toBlock, eventAbi: BUILDER_FEES_ACCRUED, onlyArgs: true });
    let fees = 0n;
    for (const log of logs) {
      if (log.builder.toLowerCase() !== builder) continue;
      if (log.user.toLowerCase() === builder) continue;
      fees += BigInt(log.amount);
    }

    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    dailyFees.addUSDValue(usd(fees), "Papertrade Builder Fees");
    dailyRevenue.addUSDValue(usd(fees), "Papertrade Builder Fees To Builder");
    return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone() };
  };

  return {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.OFF_CHAIN], // same as fees/papertrade.ts: the fee is credited inside the Papertrade Exchange on HyperEVM
    start,
    methodology: {
      Fees: `Builder fees ${name} earns on Papertrade: a share of the PnL (0.5% since launch) of positions its users close, paid by winning traders on top of the 2% win fee and taken from the Papertrade LP's gain on losing ones. Liquidations pay none, and closes by ${name}'s own address are excluded.`,
      Revenue: `All builder fees ${name} earns on Papertrade closes by its users, kept by ${name}.`,
      ProtocolRevenue: `All builder fees ${name} earns on Papertrade closes by its users, credited to ${name}'s Papertrade balance.`,
    },
    breakdownMethodology: {
      Fees: { "Papertrade Builder Fees": "Share of the PnL of positions closed by the builder's users; liquidations pay none." },
      Revenue: { "Papertrade Builder Fees To Builder": "All builder fees, kept by the builder." },
      ProtocolRevenue: { "Papertrade Builder Fees To Builder": "All builder fees, credited to the builder's Papertrade balance." },
    },
  };
}

type BuilderStats = {
  address: string;
  routing: { notionalRaw: string; asOfMs: number; daily: { dayMs: number; closes: number; notionalRaw: string }[] };
};

// /query/builders/<address>/stats: notional of the closes each builder's users signed, per UTC day. Its hourly buckets skip
// empty hours, so they cannot tell a quiet hour from one that rolled off; the daily series is used instead.
export function papertradeBuilderVolumeExports({ builder, name, start }: PapertradeBuilderConfig): SimpleAdapter {
  builder = builder.toLowerCase();
  const fetch = async (options: FetchOptions) => {
    const { address, routing }: BuilderStats = await httpGet(`${PAPERTRADE_API}/query/builders/${builder}/stats`);
    if (address !== builder) throw new Error(`papertrade: stats for ${address} returned for builder ${builder}`);
    const dayMs = options.startOfDay * 1000;
    if (routing.asOfMs < dayMs + 86400 * 1000) throw new Error(`papertrade: ${name} routing stats as of ${new Date(routing.asOfMs).toISOString()} do not cover ${options.dateString}`);
    // a day missing from the series is only a quiet day when the buckets add up to the lifetime total
    const bucketSum = routing.daily.reduce((acc, d) => acc + BigInt(d.notionalRaw), 0n);
    if (bucketSum !== BigInt(routing.notionalRaw)) throw new Error(`papertrade: ${name} daily routing buckets do not add up to its lifetime notional`);
    const day = routing.daily.find((d) => d.dayMs === dayMs);
    return { dailyVolume: day ? usd(BigInt(day.notionalRaw)) : 0 };
  };

  return {
    version: 1,
    fetch,
    chains: [CHAIN.OFF_CHAIN],
    start,
    doublecounted: true, // closes on Papertrade itself
    methodology: {
      Volume: `Notional (margin times leverage) of Papertrade positions closed by ${name}'s users, in USD; liquidations are not included.`,
    },
  };
}
