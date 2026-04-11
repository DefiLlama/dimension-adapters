import { FetchOptions } from "../adapters/types";
import fetchURL from "../utils/fetchURL";

const BASE_URL = process.env.LILSWAP_METRICS_BASE_URL || "https://api.lilswap.xyz/v1/metrics/daily";

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

export const lilswapChains: Record<string, string> = {
  ethereum: "ethereum",
  bsc: "bnb",
  polygon: "polygon",
  base: "base",
  arbitrum: "arbitrum",
  avax: "avalanche",
  optimism: "optimism",
  xdai: "gnosis",
  sonic: "sonic",
};

function parseMetric(value?: string | number | null): number {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

/**
 * Fetches one LilSwap daily metrics row for the requested chain and time window.
 *
 * Uses `options.startTimestamp` and `options.endTimestamp` as the UTC window and
 * `options.chain` to map DefiLlama's chain identifier to LilSwap's public API.
 * Returns `null` when the chain is unsupported or when the API response does not
 * contain a matching row for that chain.
 */
export async function fetchLilSwapDailyMetrics(options: FetchOptions): Promise<LilSwapMetricsRow | null> {
  const chain = lilswapChains[options.chain];
  if (!chain) return null;

  const url = `${BASE_URL}?start=${options.startTimestamp}&end=${options.endTimestamp}&chain=${chain}`;
  const response = await fetchURL(url) as LilSwapMetricsResponse;
  const row = response.data?.find((entry) => entry.chain.toLowerCase() === chain) ?? null;

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

