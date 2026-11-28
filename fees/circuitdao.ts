import { FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const STATS_API = "https://api.circuitdao.com/protocol/stats";
const MCAT = 1000; // 1 BYC = 1000 mBYC; BYC is pegged 1:1 to USD
const DAYS_IN_YEAR = 365;

const LABELS = {
  ProtocolFees: "Stability Fees",
  ProtocolFeesToTreasury: "Stability Fees To Treasury",
  SavingsInterestToDepositors: "Savings Interest To Depositors",
};

const fetch = async (options: FetchOptions) => {
  const startDate = new Date(options.startTimestamp * 1000).toISOString();
  const endDate = new Date(options.endTimestamp * 1000).toISOString();

  const { stats } = await fetchURL(
    `${STATS_API}?start_date=${startDate}&end_date=${endDate}&sample_interval=1d`
  );
  if (!stats?.length) {
    throw new Error(`[circuitdao] no stats bucket between ${startDate} and ${endDate}`);
  }

  const latest = stats[stats.length - 1];
  // projected_revenue / projected_cost are annualised, in mBYC (1 BYC = 1 USD)
  const feesUsd = (latest.projected_revenue ?? 0) / DAYS_IN_YEAR / MCAT;
  const supplySideUsd = (latest.projected_cost ?? 0) / DAYS_IN_YEAR / MCAT;

  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  dailyFees.addUSDValue(feesUsd, LABELS.ProtocolFees);
  dailySupplySideRevenue.addUSDValue(supplySideUsd, LABELS.SavingsInterestToDepositors);
  dailyRevenue.addUSDValue(feesUsd - supplySideUsd, LABELS.ProtocolFeesToTreasury);
  dailyProtocolRevenue.addUSDValue(feesUsd - supplySideUsd, LABELS.ProtocolFeesToTreasury);

  return { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue };
};

export default {
  version: 1, // API returns whole days
  fetch,
  start: "2026-01-06",
  allowNegativeValue: true,
  chains: [CHAIN.CHIA],
  methodology: {
    Fees: "Annualised stability fees divided by 365 (accrual basis)",
    Revenue: "Fees net of SupplySideRevenue",
    ProtocolRevenue: "All revenue accrues to the protocol treasury (no token holder split)",
    SupplySideRevenue: "Annualised savings interest cost divided by 365 (accrual basis)",
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.ProtocolFees]: "Stability fee accrual on outstanding debt, annualised at current rate",
    },
    Revenue: {
      [LABELS.ProtocolFeesToTreasury]: "Stability fee accrual minus savings interest accrual, annualized at their respective current rates",
    },
    ProtocolRevenue: {
      [LABELS.ProtocolFeesToTreasury]: "All protocol revenue accrues to the treasury",
    },
    SupplySideRevenue: {
      [LABELS.SavingsInterestToDepositors]: "Savings interest paid to BYC savings vault depositors, annualised at current rate",
    },
  },
};
