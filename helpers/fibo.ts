import { FetchOptions } from "../adapters/types";
import fetchURL from "../utils/fetchURL";
import ADDRESSES from "./coreAssets.json";

/** Production ryze-api base path for FIBO DefiLlama metrics. */
export const FIBO_API_URL =
  process.env.FIBO_API_URL ??
  process.env.PULSE_API_URL ??
  "https://api.fibo.fun/api/pulse";

/** Base USDC — matches collateral on production markets index. */
export const FIBO_USDC =
  process.env.FIBO_USDC ??
  process.env.PULSE_USDC ??
  ADDRESSES.base.USDC;

export type FiboDailyMetrics = {
  start: number;
  end: number;
  dailyVolumeUsdc: string;
  dailyFeesUsdc: string;
  dailyRevenueUsdc: string;
  dailyProtocolRevenueUsdc: string;
  dailySupplySideRevenueUsdc: string;
  betCount?: number;
};

export async function fetchFiboDailyMetrics(
  options: FetchOptions,
): Promise<FiboDailyMetrics> {
  const url = `${FIBO_API_URL}/defillama/daily?start=${options.startTimestamp}&end=${options.endTimestamp}`;
  const data: FiboDailyMetrics = await fetchURL(url);

  if (
    data.dailyVolumeUsdc === undefined ||
    data.dailyFeesUsdc === undefined ||
    data.dailyRevenueUsdc === undefined ||
    data.dailyProtocolRevenueUsdc === undefined ||
    data.dailySupplySideRevenueUsdc === undefined
  ) {
    throw new Error("fibo: invalid daily metrics response from ryze-api");
  }

  return data;
}
