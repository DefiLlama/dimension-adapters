/**
 * DefiLlama fees/revenue adapter for Circuit protocol.
 *
 * Place this file at fees/circuitdao.ts in the DefiLlama/dimension-adapters repo.
 *
 * Uses accrual basis: daily fees are derived from the annualised projected fee income
 * (projected_revenue / 365), so the annualised figure on DefiLlama equals projected_revenue —
 * the expected annual stability fee income at the current borrow rate and outstanding debt.
 *
 * Fees:             projected_revenue / 365 — daily stability fee + liquidation penalty accrual
 * SupplySideRevenue: projected_cost / 365   — daily savings interest accrual
 * Revenue:          dailyFees - dailySupplySideRevenue (accounting identity)
 * ProtocolRevenue:  equal to Revenue (all revenue accrues to treasury; no token holder split)
 *
 * Data source: https://api.circuitdao.com/protocol/stats
 * All BYC amounts in the API are in mBYC (milli-BYC). 1 BYC = 1000 mBYC = 1 USD.
 *
 * The values reported here can be independently verified by running the Circuit block scanner:
 * https://github.com/circuitdao/circuit-analytics
 */

import { FetchOptions } from "../adapters/types";
import fetchURL from "../utils/fetchURL";

const STATS_API = "https://api.circuitdao.com/protocol/stats";
const MCAT = 1000; // 1 BYC = 1000 mBYC; BYC is pegged 1:1 to USD
const DAYS_IN_YEAR = 365;

const LABELS = {
  ProtocolFees: "Stability Fees & Liquidation Penalties",
  ProtocolFeesToTreasury: "Stability Fees & Liquidation Penalties To Treasury",
  SavingsInterestToDepositors: "Savings Interest To Depositors",
};

const fetch = async (options: FetchOptions) => {
  // Fetch a single daily bucket at the target timestamp to get a snapshot of projected rates.
  const start = new Date((options.endTimestamp - 2 * 86400) * 1000).toISOString();
  const end = new Date(options.endTimestamp * 1000).toISOString();

  const data = await fetchURL(
    `${STATS_API}?sample_interval=1d&start_date=${start}&end_date=${end}`
  );

  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  const stats: any[] = data?.stats ?? [];
  if (stats.length === 0) {
    dailyFees.addUSDValue(0, LABELS.ProtocolFees);
    dailySupplySideRevenue.addUSDValue(0, LABELS.SavingsInterestToDepositors);
    dailyRevenue.addUSDValue(0, LABELS.ProtocolFeesToTreasury);
    dailyProtocolRevenue.addUSDValue(0, LABELS.ProtocolFeesToTreasury);
    console.error(`[circuitdao] empty stats response for ${end}`);
    return { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue };
  }

  const latest = stats[stats.length - 1];

  // Accrual basis: annualised projected income / 365 = daily estimate
  // projected_revenue and projected_cost are in mBYC; divide by MCAT for USD
  const feesUsd = (latest.projected_revenue ?? 0) / DAYS_IN_YEAR / MCAT;
  const supplySideUsd = (latest.projected_cost ?? 0) / DAYS_IN_YEAR / MCAT;

  dailyFees.addUSDValue(feesUsd, LABELS.ProtocolFees);
  dailySupplySideRevenue.addUSDValue(supplySideUsd, LABELS.SavingsInterestToDepositors);
  // revenue derived from accounting identity: dailyFees - dailySupplySideRevenue
  dailyRevenue.addUSDValue(feesUsd - supplySideUsd, LABELS.ProtocolFeesToTreasury);
  // all revenue accrues to treasury (no token holder split)
  dailyProtocolRevenue.addUSDValue(feesUsd - supplySideUsd, LABELS.ProtocolFeesToTreasury);

  return { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue };
};

export default {
  version: 2,
  pullHourly: true,
  fetch,
  start: "2026-01-06",
  allowNegativeValue: true,
  methodology: {
    Fees: "Annualised stability fees and liquidation penalties divided by 365 (accrual basis)",
    Revenue: "Fees net of SupplySideRevenue",
    ProtocolRevenue: "All revenue accrues to the protocol treasury (no token holder split)",
    SupplySideRevenue: "Annualised savings interest cost divided by 365 (accrual basis)",
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.ProtocolFees]: "Stability fees charged on BYC loans and liquidation penalties, annualised at current rate",
    },
    Revenue: {
      [LABELS.ProtocolFeesToTreasury]: "Stability fees and liquidation penalties retained by treasury after savings interest payouts",
    },
    ProtocolRevenue: {
      [LABELS.ProtocolFeesToTreasury]: "All protocol revenue accrues to the treasury",
    },
    SupplySideRevenue: {
      [LABELS.SavingsInterestToDepositors]: "Savings interest paid to BYC savings vault depositors, annualised at current rate",
    },
  },
};
