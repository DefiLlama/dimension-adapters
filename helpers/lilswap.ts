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

function parseMetric(value?: string | number | null): number {
  if (value === null || value === undefined) return 0;

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`LilSwap metric is not numeric: ${String(value)}`);
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
 * Accepts a LilSwap metrics row or `null` and safely returns `0` when the row
 * is missing or the metric cannot be parsed.
 */
export function getLilSwapVolume(row: LilSwapMetricsRow | null): number {
  return parseMetric(row?.volumeUsd);
}

/**
 * Parses LilSwap daily fee and revenue metrics as numeric USD values.
 *
 * Accepts a LilSwap metrics row or `null` and safely defaults all values to `0`
 * when the row is missing or individual fields cannot be parsed.
 */
export function getLilSwapFees(row: LilSwapMetricsRow | null) {
  const dailyFees = parseMetric(row?.feesUsd);
  const dailySupplySideRevenue = parseMetric(row?.supplySideRevenueUsd);
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

