// Extended builder dashboard response types read in ../fetch.ts, with a runtime guard for the untyped JSON it returns.

// One builder's totals over a period on the Extended builder dashboard. Amounts are decimal strings in USD.
export interface ExtendedBuilderStats {
  builderName: string; // the builder's display name, or its address when it has none
  volume: string; // notional of all fills carrying the builder code
  extendedFees: string; // Extended's own trading fees on those fills, NOT the builder fee
  activeUsers: number;
}

export interface ExtendedBuilderDailyStats extends ExtendedBuilderStats {
  date: string; // UTC day, YYYY-MM-DD
}

// GET EXTENDED_BUILDERS_API, public and parameterless: every builder, aggregated per period
export interface ExtendedBuilderDashboard {
  status: "OK";
  data: {
    total: ExtendedBuilderStats[]; // lifetime
    day: ExtendedBuilderStats[]; // today so far
    week: ExtendedBuilderStats[];
    month: ExtendedBuilderStats[];
    daily: ExtendedBuilderDailyStats[]; // one row per builder per UTC day, last ~31 days only
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isAmount = (value: unknown): value is string => typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value));

const isBuilderStats = (value: unknown): value is ExtendedBuilderStats =>
  isRecord(value) &&
  typeof value.builderName === "string" &&
  isAmount(value.volume) &&
  isAmount(value.extendedFees) &&
  typeof value.activeUsers === "number";

const isBuilderDailyStats = (value: unknown): value is ExtendedBuilderDailyStats =>
  isRecord(value) && typeof value.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.date) && isBuilderStats(value);

// Every daily row is checked field by field, since that is the data the adapter reads; the other periods are unread,
// so only their presence as arrays is checked.
export function isExtendedBuilderDashboard(value: unknown): value is ExtendedBuilderDashboard {
  if (!isRecord(value) || value.status !== "OK" || !isRecord(value.data)) return false;
  const { total, day, week, month, daily } = value.data;
  return [total, day, week, month].every(Array.isArray) && Array.isArray(daily) && daily.every(isBuilderDailyStats);
}
