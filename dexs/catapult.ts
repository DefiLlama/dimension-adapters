// DefiLlama dimension adapter for Catapult — a perps/futures trading venue.
// ***This file lives in DefiLlama's dimension-adapters repo (dexs/catapult.ts), not ours.*** It is
// kept here as the canonical, version-controlled source we submit via PR. It is intentionally OUTSIDE
// src/ so our own tsc build ignores it (the imports resolve against DefiLlama's repo, not this one).
//
// Volume, fees and revenue are reported by Catapult via a public metrics API that returns the full
// daily series in USD (one point per UTC day). Only final aggregates leave our server — the SQL, raw
// rows and modelling stay private. Catapult is a centralized venue, so there is no on-chain contract
// to read TVL from (no TVL), and no open-interest feed. Modelled on kalshi.ts (a fellow off-chain venue).
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

const fetch = async (options: FetchOptions) => {
  const metrics: Metrics = await fetchURL(METRICS_URL); // fetchURL returns the parsed JSON body
  const day = new Date(options.startOfDay * 1000).toISOString().slice(0, 10); // the UTC day being queried
  const valueOn = (series: DailyPoint[]) => series.find((p) => p.date === day)?.value ?? 0;
  return {
    dailyVolume: valueOn(metrics.volume),
    dailyFees: valueOn(metrics.fees),
    dailyRevenue: valueOn(metrics.revenue),
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.OFF_CHAIN],
  start: "2025-08-28",
  methodology: {
    Volume: "Notional trading volume (perps + spot) settled on Catapult, reported daily in USD via Catapult's public metrics API.",
    Fees: "All trading fees collected from users (open + close + profit fees), reported daily in USD.",
    Revenue: "Protocol revenue — trading fees retained by Catapult (equal to Fees).",
  },
};

export default adapter;
