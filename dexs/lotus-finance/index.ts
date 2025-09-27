import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const LOTUS_BASE = process.env.LOTUS_API_BASE ?? "https://lotus-api.lotusfinance.xyz";
const LOTUS_PATH = "/contract/performance";
const INTERVAL = "1d";

// The API returns an array of tuples (rows) like:
// [ timeMs, volumeUsdStr, ..., ..., ... ]
type LotusRow = [string | number, string | number, any?, any?, any?];

function toEpochSecFromMs(msLike: string | number): number {
  const n = typeof msLike === "number" ? msLike : Number(String(msLike));
  return Math.floor(n / 1000);
}

function toNumber(x: unknown): number {
  if (x == null) return 0;
  if (typeof x === "number") return x;
  const s = String(x).replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

async function fetchLotus(startSec: number, endSec: number): Promise<LotusRow[]> {
  const qs = new URLSearchParams({
    startTime: String(startSec * 1000),  // API expects ms
    endTime: String(endSec * 1000),
    interval: INTERVAL,
  }).toString();

  const url = `${LOTUS_BASE}${LOTUS_PATH}?${qs}`;
  const res = await globalThis.fetch(url);
  if (!res.ok) throw new Error(`Lotus API ${url} -> ${res.status} ${res.statusText}`);
  const data = await res.json();

  // Accept either bare array or { data: [...] }
  const rows: unknown = Array.isArray(data) ? data : (data?.data ?? []);
  if (!Array.isArray(rows)) return [];
  return rows as LotusRow[];
}

const fetch = async (options: FetchOptions) => {
  const { startTimestamp, endTimestamp, createBalances } = options;
  const dailyVolume = createBalances();

  const rows = await fetchLotus(startTimestamp, endTimestamp);

  for (const row of rows) {
    // Defensive: ensure row has at least [timeMs, volumeUsd]
    if (!Array.isArray(row) || row.length < 2) continue;

    const [timeMs, volumeUsdLike] = row;
    const ts = toEpochSecFromMs(timeMs);
    if (ts < startTimestamp || ts >= endTimestamp) continue;

    const volUSD = toNumber(volumeUsdLike);
    if (volUSD <= 0) continue;

    // Add USD amount directly
    // @ts-ignore
    if (typeof (dailyVolume as any).addUSDValue === "function") (dailyVolume as any).addUSDValue(volUSD);
  }

  return { dailyVolume };
};

const methodology = {
    Volume: "USD-denominated sum of executed orders across all pools.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SUI],
  // Set to earliest day you can backfill from the API:
  start: "2025-06-28",
  methodology,
};

export default adapter;
