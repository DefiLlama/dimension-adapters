import { CHAIN } from "../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import fetchURL from "../utils/fetchURL";
import { METRIC } from "../helpers/metrics";

// Streamlock — a Solana launchpad / bonding-curve protocol.
//
// We source fees/revenue from Streamlock's cached daily income-statement
// endpoint rather than on-chain. The referral-rebate leg (part of supply-side
// revenue, and the thing that makes `revenue` net) is off-chain Supabase
// accounting, paid as untagged batched SystemProgram transfers with no on-chain
// linkage to a swap. Gross fees and the LP/protocol split are derivable
// on-chain, but the net protocol revenue DeFiLlama's income-statement model
// requires is not — so this endpoint is the only source that yields it.
//
// Each point is one UTC day and already reconciles by construction:
//   daily.fees = daily.supplySideRevenue + daily.revenue
// Amounts are decimal SOL; we add them via the SOL CoinGecko id so DeFiLlama
// prices them with its own SOL/USD feed (consistent with the live TVL adapter,
// which treats SOL amounts as canonical). The *Usd fields the endpoint also
// returns are only that-day's-price cross-checks and are intentionally unused.
const HISTORY_URL =
  "https://app.streamlock.fun/api/protocol/metrics/history?range=all";

// First daily snapshot Streamlock wrote. The series is shallow / un-backfilled,
// and per the endpoint's own meta the first available day carries the full
// prior cumulative (so the series reconciles to lifetime totals) — it will look
// like a spike on the start day. That is the source data, not adapter drift.
const START_DATE = "2026-06-12";

interface DailyPoint {
  timestamp: number; // unix seconds, UTC midnight
  daily: {
    fees: number;
    supplySideRevenue: number;
    revenue: number;
    lpShare: number;
    referral: number;
  };
}

// Fetch the whole series once and share it across every per-day fetch() call in
// a run.
let pointsPromise: Promise<DailyPoint[]> | undefined;
function getPoints(): Promise<DailyPoint[]> {
  if (!pointsPromise)
    pointsPromise = fetchURL(HISTORY_URL).then((r: any) => r?.points ?? []);
  return pointsPromise;
}

const fetch = async (options: FetchOptions) => {
  const points = await getPoints();
  const point = points.find((p) => p.timestamp === options.startOfDay);
  if (!point)
    throw new Error(
      `Streamlock: no daily snapshot for ${options.dateString} (${options.startOfDay})`
    );

  const d = point.daily;
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.addCGToken("solana", d.fees || 0, METRIC.SWAP_FEES);
  dailyRevenue.addCGToken(
    "solana",
    d.revenue || 0,
    "Swap fees to protocol (net of referral)"
  );
  dailySupplySideRevenue.addCGToken(
    "solana",
    d.supplySideRevenue || 0,
    "Swap fees to LPs + referral rebates"
  );

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Gross swap fees collected across all Streamlock pools.",
  UserFees: "Swap fees paid by traders.",
  Revenue:
    "Net fees kept by the protocol = gross swap fees minus the LP share and minus referral rebates (40-50% of the protocol fee, paid to referrers).",
  ProtocolRevenue:
    "Net protocol keep, all accrued to the Streamlock treasury (no governance-token holder distribution).",
  SupplySideRevenue:
    "Fees paid out to capital/relationship suppliers: the LP share plus referral rebates.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Gross swap fees across all pools.",
  },
  UserFees: {
    [METRIC.SWAP_FEES]: "Swap fees paid by traders.",
  },
  Revenue: {
    "Swap fees to protocol (net of referral)":
      "Protocol fee share after subtracting referral rebates.",
  },
  ProtocolRevenue: {
    "Swap fees to protocol (net of referral)":
      "Protocol fee share after subtracting referral rebates, accrued to treasury.",
  },
  SupplySideRevenue: {
    "Swap fees to LPs + referral rebates":
      "LP fee share plus off-chain referral rebates paid to referrers.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.SOLANA],
  fetch,
  start: START_DATE,
  methodology,
  breakdownMethodology,
};

export default adapter;
