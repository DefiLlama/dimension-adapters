import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

// LiquidBots — automated grid-trading bots on Hyperliquid perps.
// Daily trading fees + referrer rebates, from the protocol's public stats endpoint.
//
// We use the protocol's fee accounting (confirmed per-user fee batches) rather than raw
// USDC inflows to the fee wallet on the Hyperliquid ledger: the fee wallet also receives
// non-fee internal/treasury/MM transfers, so summing ledger inflows would overcount fees.
// Referrer rebates (paid off-chain) are exposed as `payouts`, so net revenue is derivable.
const STATS_URL = "https://api.liquidbots.xyz/api/v1/stats/fees";

interface FeeDay {
  date: string; // UTC day, "YYYY-MM-DD"
  fees: number; // gross trading fees collected that day, in USD
  payouts: number; // referrer rebates that day, in USD
  revenue: number; // fees - payouts (recomputed with a clamp below)
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // The endpoint returns the full daily series; pick the UTC day being measured.
  const day = new Date(options.startTimestamp * 1000).toISOString().slice(0, 10);
  const res = await httpGet(STATS_URL);
  const row: FeeDay | undefined = (res?.daily || []).find((d: FeeDay) => d.date === day);

  if (row) {
    const fees = Number(row.fees);
    const payouts = Number(row.payouts);
    if (Number.isFinite(fees) && fees > 0) {
      // Referrer rebates are the supply-side share; clamp to fees so revenue stays >= 0
      // and the identity Fees = Revenue + SupplySideRevenue holds.
      const rebates = Number.isFinite(payouts) ? Math.max(0, Math.min(payouts, fees)) : 0;
      dailyFees.addUSDValue(fees, "Trading Fees");
      dailySupplySideRevenue.addUSDValue(rebates, "Referrer Rebates");
      dailyRevenue.addUSDValue(fees - rebates, "Trading Fees To Protocol");
      dailyProtocolRevenue.addUSDValue(fees - rebates, "Trading Fees To Protocol");
    }
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: "Gross trading fees collected from users, from the LiquidBots public stats endpoint (api.liquidbots.xyz/api/v1/stats/fees), which sums confirmed per-user fee batches.",
  Revenue: "Trading fees retained by the protocol after referrer rebates (gross fees minus rebates).",
  ProtocolRevenue: "Same as Revenue.",
  SupplySideRevenue: "Referrer rebates paid back out of collected fees to referrers.",
};

const breakdownMethodology = {
  Fees: {
    "Trading Fees": "Gross trading fees collected from users' confirmed fee batches.",
  },
  Revenue: {
    "Trading Fees To Protocol": "Gross trading fees minus referrer rebates.",
  },
  ProtocolRevenue: {
    "Trading Fees To Protocol": "Gross trading fees minus referrer rebates.",
  },
  SupplySideRevenue: {
    "Referrer Rebates": "Referrer rebates distributed to referrers out of collected fees.",
  },
};

const adapter: Adapter = {
  version: 2,
  pullHourly: false, // the stats endpoint is daily
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: '2026-02-10', // first fee day reported by /stats/fees
  methodology,
  breakdownMethodology,
};

export default adapter;
