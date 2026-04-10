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

export async function fetchLilSwapDailyMetrics(options: FetchOptions): Promise<LilSwapMetricsRow | null> {
  const chain = lilswapChains[options.chain];
  if (!chain) return null;

  const url = `${BASE_URL}?start=${options.startTimestamp}&end=${options.endTimestamp}&chain=${chain}`;
  const response = await fetchURL(url) as LilSwapMetricsResponse;
  const row = response.data?.find((entry) => entry.chain.toLowerCase() === chain) ?? response.data?.[0];

  return row ?? null;
}

export function getLilSwapVolume(row: LilSwapMetricsRow | null): number {
  return parseMetric(row?.volumeUsd);
}

export function getLilSwapFees(row: LilSwapMetricsRow | null) {
  return {
    dailyFees: parseMetric(row?.feesUsd),
    dailyUserFees: parseMetric(row?.feesUsd),
    dailyRevenue: parseMetric(row?.revenueUsd),
    dailyProtocolRevenue: parseMetric(row?.protocolRevenueUsd),
    dailySupplySideRevenue: parseMetric(row?.supplySideRevenueUsd),
  };
}

