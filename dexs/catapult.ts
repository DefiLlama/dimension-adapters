import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const METRICS_URL = "https://cmtbsmcpbot.catapult.ink/defillama/metrics";

interface DailyPoint { date: string; value: number }
interface Metrics {
  asOf: string;
  unit: string; // "USD"
  volume: DailyPoint[];
  fees: DailyPoint[];
  revenue: DailyPoint[];
}

const fetch = async ({ dateString }: FetchOptions) => {
  const metrics: Metrics = await fetchURL(METRICS_URL);
  // Use the precomputed UTC day; throw (don't fall back to 0) when a day is absent, so the infra
  // marks it missing instead of persisting a wrong zero into the historical chart.
  const valueOn = (series: DailyPoint[]) => {
    const point = series.find((p) => p.date === dateString);
    if (!point) throw new Error(`No Catapult metrics data for ${dateString}`);
    return point.value;
  };

  return {
    dailyVolume: valueOn(metrics.volume),
    dailyFees: valueOn(metrics.fees),
    dailyRevenue: valueOn(metrics.revenue),
    dailyProtocolRevenue: valueOn(metrics.revenue),
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.OFF_CHAIN],
  start: "2025-08-28",
  methodology: {
    Volume: "Notional volume of synthetic trades (Turbo Mode) on Catapult Trade, reported daily in USD via Catapult's public metrics API.",
    Fees: "All trading fees collected from users (open + close + profit fees), reported daily in USD via Catapult's public metrics API.",
    Revenue: "All trading fees collected from users (open + close + profit fees), are retained by Catapult.",
    ProtocolRevenue: "All trading fees collected from users (open + close + profit fees), are retained by Catapult.",
  },
};

export default adapter;
