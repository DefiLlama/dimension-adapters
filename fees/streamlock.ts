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

/**
 * Fetch Streamlock's full daily income-statement series once and share the
 * promise across every per-day fetch() call in a run. Throws on a malformed
 * payload (missing / non-array `points`) so a broken data source surfaces as a
 * hard failure instead of being silently read as zero fees forever.
 */
let pointsPromise: Promise<DailyPoint[]> | undefined;
function getPoints(): Promise<DailyPoint[]> {
  if (!pointsPromise)
    pointsPromise = fetchURL(HISTORY_URL).then((r: any) => {
      if (!r || !Array.isArray(r.points))
        throw new Error("Streamlock: malformed /history response (no points[] array)");
      const points = r.points as DailyPoint[];
      const bad = points.findIndex(
        (p) => typeof p?.timestamp !== "number" || typeof p?.daily !== "object" || p.daily === null
      );
      if (bad !== -1)
        throw new Error(
          `Streamlock: malformed /history point at index ${bad} (missing timestamp/daily)`
        );
      return points;
    });
  return pointsPromise;
}

/**
 * Map the daily snapshot for the requested UTC day to DeFiLlama's three fee
 * dimensions (SOL amounts, priced by DeFiLlama). A day that isn't in the series
 * yet — e.g. today's snapshot hasn't been written — is a recoverable data gap,
 * so we log and return zero balances rather than throwing.
 */
const fetch = async (options: FetchOptions) => {
  const points = await getPoints();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const result = {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };

  const point = points.find((p) => p.timestamp === options.startOfDay);
  if (!point) {
    console.info(
      `Streamlock: no daily snapshot for ${options.dateString} (${options.startOfDay}); returning zero balances`
    );
    return result;
  }

  const d = point.daily;
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

  return result;
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
  // version 1: the source is a daily-aggregate external endpoint keyed to UTC
  // midnight (matched on options.startOfDay), so daily-granular scheduling — not
  // v2's hourly model — is correct.
  version: 1,
  chains: [CHAIN.SOLANA],
  fetch,
  start: START_DATE,
  methodology,
  breakdownMethodology,
};

export default adapter;
