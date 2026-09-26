import { FetchOptions } from "../adapters/types";
import fetchURL from "../utils/fetchURL";

// vfat daily user metrics per chain and UTC day, rebuilt from indexed Sickle deploys and actions.
// A user is a Sickle owner wallet (the admin set once at Sickle deploy).
// A day before the chain's `first_day` is a 404 and a metric not yet available is null;
// both throw here rather than being stored as 0.
const API = "https://info-api.vf.at/daily-users";

type VfatDailyUsersMetric = "active_users" | "new_users";

type VfatDailyUsersRow = {
  date: string;
  day_ended: boolean;
  active_users: number | null;
  new_users: number | null;
};

function isVfatDailyUsersRow(value: unknown): value is VfatDailyUsersRow {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.date === "string" &&
    typeof row.day_ended === "boolean" &&
    (typeof row.active_users === "number" || row.active_users === null) &&
    (typeof row.new_users === "number" || row.new_users === null);
}

/**
 * Fetches one vfat daily user count for a chain and a finished UTC day.
 *
 * @param options - `options.dateString` (YYYY-MM-DD) names the UTC day.
 * @param chainId - EVM chain id of the chain in the API scope, or 0 for all chains with each owner
 *   counted once.
 * @param metric - `active_users`: owners with at least one executed Sickle action that day,
 *   including automation-only owners. `new_users`: owners whose first Sickle deploy on the chain
 *   (any chain for 0) was that day.
 * @returns The non-negative integer count for that chain and day.
 * @throws If the UTC day has not ended yet, the request fails (for example a day before the
 *   chain's first deploy), the response is for another chain, the day's row is missing or
 *   malformed, the API has not closed the day, or the metric is null.
 */
export async function fetchVfatDailyUsers(options: FetchOptions, chainId: number, metric: VfatDailyUsersMetric): Promise<number> {
  const date = options.dateString;
  // The API also serves the running total of the current UTC day; only a finished day is final.
  const dayEnd = Date.parse(`${date}T00:00:00Z`) / 1000 + 86400;
  if (Date.now() / 1000 < dayEnd) throw new Error(`vfat: ${date} has not ended yet`);

  const res = await fetchURL(`${API}?chainId=${chainId}&startDate=${date}&endDate=${date}`);
  if (res?.chain_id !== chainId) throw new Error(`vfat: unexpected chain ${res?.chain_id} for ${chainId} on ${date}`);

  const rows: VfatDailyUsersRow[] = Array.isArray(res.data) ? res.data.filter(isVfatDailyUsersRow) : [];
  const row = rows.find((d) => d.date === date);
  if (!row) throw new Error(`vfat: no daily-users row for chain ${chainId} on ${date}`);
  if (!row.day_ended) throw new Error(`vfat: ${date} is not closed yet for chain ${chainId}`);

  const value = row[metric];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) throw new Error(`vfat: ${metric} unavailable for chain ${chainId} on ${date}`);
  return value;
}
