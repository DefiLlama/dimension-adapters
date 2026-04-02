/**
 * DefiLlama fees/revenue adapter for Circuit protocol.
 *
 * Place this file at fees/circuitdao.ts in the DefiLlama/dimension-adapters repo.
 *
 * Fees:    Stability fees paid by BYC borrowers + liquidation penalties collected.
 * Revenue: Fees received by the protocol net of interest paid to savings vault depositors and bad debt principal recovered.
 * SupplySideRevenue: Interest paid out to BYC savings vault depositors.
 *
 * Data source: https://api.circuitdao.com/protocol/stats
 * All BYC amounts in the API are in mBYC (milli-BYC). 1 BYC = 1000 mBYC = 1 USD.
 *
 * The values reported here can be independently verified by running the Circuit block scanner:
 * https://github.com/circuitdao/circuit-analytics
 */

import { fetchURL } from "../utils/fetchURL";

const STATS_API = "https://api.circuitdao.com/protocol/stats";
const MCAT = 1000; // 1 BYC = 1000 mBYC; BYC is pegged 1:1 to USD

const fetch = async (timestamp: number) => {
  // Fetch 3 days of daily-bucketed data ending at the target timestamp.
  // This ensures we always have at least two consecutive daily entries to diff.
  const start = new Date((timestamp - 3 * 86400) * 1000).toISOString();
  const end = new Date(timestamp * 1000).toISOString();

  const data = await fetchURL(
    `${STATS_API}?sample_interval=1d&start_date=${start}&end_date=${end}`
  );

  const stats: any[] = data?.stats ?? [];
  if (stats.length < 2) return {};

  // stats entries contain cumulative running totals; diff last two to get the day's delta
  const latest = stats[stats.length - 1];
  const prev = stats[stats.length - 2];

  // fees_received, profit, and interest_paid are cumulative totals in mBYC
  const dailyFeesUsd = (latest.fees_received - prev.fees_received) / MCAT;
  const dailyRevenueUsd = (latest.profit - prev.profit) / MCAT;
  const dailySupplySideUsd = (latest.interest_paid - prev.interest_paid) / MCAT;

  return {
    dailyFees: Math.max(0, dailyFeesUsd).toString(),
    dailyRevenue: dailyRevenueUsd.toString(),
    dailySupplySideRevenue: Math.max(0, dailySupplySideUsd).toString(),
  };
};

export default {
  timetravel: true,
  fetch,
  start: "2026-01-06",
  methodology: {
    Fees: "Stability fees (interest) and liquidation penalties paid into treasury",
    Revenue: "Fees net of SupplySideRevenue and bad debt recovered",
    SupplySideRevenue: "Interest paid to savings vault depositors",
  },
};
