type Get = (url: string) => Promise<any>;

const INDEXER = "https://indexer.dex.cl8y.com/api/v1";

/** Parse finite, non-negative USD numbers or decimal strings; reject other forms. */
function usd(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" &&
      !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Require an exact non-negative integer trade count for comparing rollup scopes. */
function count(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Read the UTC day's priced volume, recovering legacy nulls only from a matching
 * protocol rollup. The runner supplies startOfDay and dateString through
 * FetchOptions; missing, malformed or differently scoped data throws.
 */
export async function getDailyVolume(startOfDay: number, date: string, get: Get): Promise<number> {
  const data = await get(`${INDEXER}/defillama/daily?timestamp=${startOfDay}`);
  if (data?.timestamp !== startOfDay || data?.date !== date || !count(data?.trade_count)) {
    throw new Error(`cl8y-dex invalid daily response for ${date}`);
  }
  const volume = usd(data.volume_usd);
  if (volume !== null) {
    if (volume === 0 && data.trade_count > 0) {
      throw new Error(`cl8y-dex active day has no priced volume for ${date}`);
    }
    return volume;
  }
  // Only recover the legacy feed's explicit null, never a malformed USD value.
  if (data.volume_usd !== null || data.trade_count === 0) {
    throw new Error(`cl8y-dex dailyVolume unpriced or missing for ${date}`);
  }

  // Both rollups count swap_events once per hop in the same UTC window. The
  // protocol series includes gem pairs; the Llama feed excludes them. Equal
  // counts are required before using its priced SUM, so excluded swaps cannot
  // enter this fallback. Never substitute a trailing overview or fee series.
  // Source: https://git.cl8y.com/code/cl8y-dex-terraclassic/issues/1354
  const series = await get(`${INDEXER}/protocol/volume/daily?grain=daily&limit=90`);
  if (series?.grain !== "daily" || series?.timezone !== "UTC" ||
      series?.methodology !== "protocol_catalog" || !Array.isArray(series?.series)) {
    throw new Error(`cl8y-dex invalid volume series for ${date}`);
  }
  const rows = series.series.filter((row: any) => row.utc_day === date);
  const row = rows[0];
  const priced = usd(row?.volume_usd);
  if (rows.length !== 1 || row.trade_count !== data.trade_count ||
      priced === null || priced <= 0) {
    throw new Error(`cl8y-dex no matching priced volume with identical trade count for ${date}`);
  }
  // A lower bound: unpriced swaps have no invented value. Missing/all-unpriced
  // days and dates outside the series' 90-day retention still fail explicitly.
  return priced;
}
