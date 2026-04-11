import { FetchOptions } from "../adapters/types";
import fetchURL from "../utils/fetchURL";

const BASE_URL = process.env.LILSWAP_METRICS_BASE_URL || "https://api.lilswap.xyz/v1/metrics/daily";
export type ChainAliasMap = Readonly<Record<string, string>>;

type LilSwapMetricsRow = {
  date: string;
  chain: string;
  volumeUsd: string;
  feesUsd: string;
  revenueUsd: string;
  protocolRevenueUsd: string;
  supplySideRevenueUsd: string;
  txCount: number;
  explicitFeeVolumeUsd: string;
  surplusVolumeUsd: string;
  zeroFeeVolumeUsd: string;
  coverage: {
    metricsReadyTxCount: number;
    confirmedTxCount: number;
    ratio: number;
  };
};

type LilSwapMetricsResponse = {
  meta: {
    start: number;
    end: number;
    generatedAt: string;
    source: string;
  };
  data: LilSwapMetricsRow[];
};

/**
 * Parses one numeric field from the LilSwap metrics payload.
 *
 * Returns `0` when the field is missing and throws when a present value is not
 * a finite number.
 */
function parseMetric(fieldName: string, value?: string | number | null): number {
  if (value === null || value === undefined) return 0;

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`LilSwap metric field=${fieldName} is not numeric: ${String(value)}`);
  }

  return numeric;
}

/**
 * Fetches one LilSwap daily metrics row for the requested chain and time window.
 *
 * Uses `options.startTimestamp` and `options.endTimestamp` as the UTC window and
 * `options.chain` plus the provided `chainAliasMap` to map DefiLlama's chain
 * identifier to LilSwap's public API. Throws when the chain alias map is
 * missing the requested chain or when the API payload is malformed. Returns
 * `null` only when the response is valid but does not contain a matching row
 * for that chain.
 */
export async function fetchLilSwapDailyMetrics(
  options: FetchOptions,
  chainAliasMap: ChainAliasMap,
): Promise<LilSwapMetricsRow | null> {
  const chain = chainAliasMap[options.chain];
  if (!chain) {
    throw new Error(`LilSwap chain alias missing for options.chain=${options.chain}`);
  }

  const url = `${BASE_URL}?start=${options.startTimestamp}&end=${options.endTimestamp}&chain=${chain}`;
  const response = await fetchURL(url) as Partial<LilSwapMetricsResponse>;
  if (!Array.isArray(response.data)) {
    throw new Error(`LilSwap metrics payload is invalid for url=${url}: ${JSON.stringify(response.data)}`);
  }

  const row = response.data.find(
    (entry) => typeof entry?.chain === "string" && entry.chain.toLowerCase() === chain
  ) ?? null;

  return row ?? null;
}

/**
 * Parses LilSwap daily volume as a numeric USD value.
 *
 * Accepts a LilSwap metrics row or `null` and returns `0` when the row or
 * field is missing. Throws if `volumeUsd` is present but non-numeric.
 */
export function getLilSwapVolume(row: LilSwapMetricsRow | null): number {
  return parseMetric("volumeUsd", row?.volumeUsd);
}

/**
 * Parses LilSwap daily fee and revenue metrics as numeric USD values.
 *
 * Accepts a LilSwap metrics row or `null` and defaults values to `0` only when
 * the row or field is missing. Throws if present fields are non-numeric or if
 * the derived revenue would be negative.
 */
export function getLilSwapFees(row: LilSwapMetricsRow | null) {
  const dailyFees = parseMetric("feesUsd", row?.feesUsd);
  const dailySupplySideRevenue = parseMetric("supplySideRevenueUsd", row?.supplySideRevenueUsd);
  const dailyRevenue = dailyFees - dailySupplySideRevenue;

  if (dailyRevenue < 0) {
    throw new Error("LilSwap fees metrics are inconsistent: revenue cannot be negative");
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
}

