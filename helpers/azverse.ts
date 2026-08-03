import { httpGet } from "../utils/fetchURL";

const BASE_URL = "https://app.azverse.xyz/exapi/stats/v1/stats/public/defillama";

export type AzverseMarket = "perp" | "spot";

type DailyStatsBucket = {
  volume: number;
  fees: number;
  revenue: number;
};

type DailyStatsResponse = {
  code?: number;
  msg?: string;
  data?: {
    date?: string;
    perp?: DailyStatsBucket;
    spot?: DailyStatsBucket;
  };
};

export type AzverseDailyStats = {
  volume: number;
  fees: number;
  builderRevenue: number;
  protocolRevenue: number;
};

/**
 * The AZverse API exposes immutable UTC-day aggregates only. `revenue` is the
 * builder fee share, so it is a supply-side cost rather than protocol revenue.
 */
export async function getAzverseDailyStats(date: string, market: AzverseMarket): Promise<AzverseDailyStats> {
  const response: DailyStatsResponse = await httpGet(`${BASE_URL}/daily-stats?date=${date}`);
  if (response?.code !== 200) throw new Error(`AZverse daily stats unavailable for ${date}: ${response?.msg ?? "unknown error"}`);
  if (response.data?.date !== date) throw new Error(`AZverse daily stats returned a mismatched date: expected ${date}, got ${response.data?.date}`);

  const bucket = response.data[market];
  if (!bucket) throw new Error(`AZverse daily stats missing ${market} data for ${date}`);

  const volume = Number(bucket.volume);
  const fees = Number(bucket.fees);
  const builderRevenue = Number(bucket.revenue);
  if (![volume, fees, builderRevenue].every(Number.isFinite) || volume < 0 || fees < 0 || builderRevenue < 0) {
    throw new Error(`AZverse daily stats contain invalid ${market} values for ${date}`);
  }
  if (builderRevenue > fees) throw new Error(`AZverse builder revenue exceeds fees for ${market} on ${date}`);

  return { volume, fees, builderRevenue, protocolRevenue: fees - builderRevenue };
}
