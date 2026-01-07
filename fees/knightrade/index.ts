import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

// -----------------------------
// Config
// -----------------------------

// Knightrade Drift Vault
const VAULT_ADDRESS = "CqLEEKfZwzp9BLp8kYsnPCFFSUPqMx5wRHJn8GRR9eUj";

// Drift vault historical snapshots (public, no API key)
const DRIFT_S3_BASE =
  "https://drift-historical-data-v2.s3.eu-west-1.amazonaws.com/program/vAuLTsyrvSfZRuRB3XgvkPwNGgYSs9YRYymVebLKoxR";

// Fee split per maintainer guidance
const PERFORMANCE_FEE_RATE = 0.20; // protocol revenue
const SUPPLY_SIDE_RATE = 0.80;     // depositors

// -----------------------------
// Types
// -----------------------------

interface VaultSnapshot {
  ts: number;
  vault: string;
  equity: number;
  totalShares: number;
}

// -----------------------------
// Helpers
// -----------------------------

async function getVaultSnapshots(
  year: number,
  month: number
): Promise<VaultSnapshot[]> {
  try {
    const url = `${DRIFT_S3_BASE}/vault/${year}/${String(month).padStart(2, "0")}`;
    const csv = await httpGet(url);

    const lines = csv.trim().split("\n");
    const headers = lines[0].split(",");

    return lines
      .slice(1)
      .map((line) => {
        const values = line.split(",");
        const row: any = {};
        headers.forEach((h, i) => (row[h.trim()] = values[i]));
        return row;
      })
      .filter((r) => r.vault === VAULT_ADDRESS)
      .map((r) => ({
        ts: Number(r.ts),
        vault: r.vault,
        equity: Number(r.equity ?? r.vaultEquity ?? 0),
        totalShares: Number(r.totalShares ?? 0),
      }));
  } catch {
    return [];
  }
}

// -----------------------------
// Adapter
// -----------------------------

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const endDate = new Date(options.endTimestamp * 1000);
  const startDate = new Date(options.startTimestamp * 1000);

  const year = endDate.getUTCFullYear();
  const month = endDate.getUTCMonth() + 1;

  const snapshots = await getVaultSnapshots(year, month);

  // Need at least two snapshots (yesterday & today)
  if (snapshots.length < 2) {
    // Fallback: data not available yet
    dailyFees.addUSDValue(0);
    dailyRevenue.addUSDValue(0);
    dailySupplySideRevenue.addUSDValue(0);
    return { dailyFees, dailyRevenue, dailySupplySideRevenue };
  }

  const todaySnap = snapshots
    .filter((s) => new Date(s.ts * 1000).toDateString() === endDate.toDateString())
    .pop();

  const yesterdaySnap = snapshots
    .filter(
      (s) => new Date(s.ts * 1000).toDateString() === startDate.toDateString()
    )
    .pop();

  if (!todaySnap || !yesterdaySnap || todaySnap.totalShares === 0) {
    dailyFees.addUSDValue(0);
    dailyRevenue.addUSDValue(0);
    dailySupplySideRevenue.addUSDValue(0);
    return { dailyFees, dailyRevenue, dailySupplySideRevenue };
  }

  const todayPrice = todaySnap.equity / todaySnap.totalShares;
  const yesterdayPrice = yesterdaySnap.equity / yesterdaySnap.totalShares;

  const dailyPerformance = Math.max(
    0,
    (todayPrice - yesterdayPrice) * todaySnap.totalShares
  );

  const feesUSD = dailyPerformance;
  const revenueUSD = feesUSD * PERFORMANCE_FEE_RATE;
  const supplySideUSD = feesUSD * SUPPLY_SIDE_RATE;

  dailyFees.addUSDValue(feesUSD);
  dailyRevenue.addUSDValue(revenueUSD);
  dailySupplySideRevenue.addUSDValue(supplySideUSD);

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
  };
};

// -----------------------------
// Export
// -----------------------------

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: "2024-09-01",
    },
  },
  methodology: {
    Fees:
      "Fees are derived from Knightrade’s Drift vault daily performance. Daily performance is calculated using Drift’s public vault snapshots as (today share price − yesterday share price) × total shares. All positive vault performance is treated as fees.",
    Revenue:
      "Protocol revenue equals 20% of daily vault performance, matching the on-chain performance fee charged by Knightrade.",
    SupplySideRevenue:
      "Supply-side revenue equals 80% of daily vault performance and represents yield accruing to vault depositors.",
  },
};

export default adapter;
