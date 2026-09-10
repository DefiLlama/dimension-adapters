import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { METRIC } from "../../helpers/metrics";

// Jetbit is a perpetual-futures exchange where every position fills against a
// single on-chain USDT pool on BNB Chain (custody/settlement is on-chain; the
// matching engine is off-chain). Per-trade volume therefore cannot be read from
// chain, so it is served from Jetbit's PUBLIC, aggregate-only feed:
//
//   GET https://jetbit.com/_exchange/api/v1/public/defillama/overview
//   -> {
//        dailyVolume: [{ date: "YYYY-MM-DD" (UTC), volume: number }],
//        dailyFees:   [{ date: "YYYY-MM-DD" (UTC), fees:   number }],
//        ...
//      }
//
// Volume = real perpetual notional (filled_quantity x filled_price). Copy-trade
// mirror volume and any display padding are excluded server-side, so the numbers
// reconcile to Jetbit's own books. Fees = trading commission (funding excluded).
const OVERVIEW = "https://jetbit.com/_exchange/api/v1/public/defillama/overview";

const fetch = async (options: FetchOptions) => {
  const data = await fetchURL(OVERVIEW);

  const volRows: any[] = Array.isArray(data.dailyVolume) ? data.dailyVolume : [];
  const feeRows: any[] = Array.isArray(data.dailyFees) ? data.dailyFees : [];
  const rebateRows: any[] = Array.isArray(data.dailyReferralRebates) ? data.dailyReferralRebates : [];

  const volRow = volRows.find((r) => r.date === options.dateString);
  const feeRow = feeRows.find((r) => r.date === options.dateString);
  // Referral rebates are optional (a day may have none) — never throw on their absence.
  const rebateRow = rebateRows.find((r) => r.date === options.dateString);

  if (!volRow || !feeRow) {
    throw new Error(`No data found for date ${options.dateString}`);
  }

  // REQUIRED aggregates: a malformed row (missing/NaN/Infinity/negative) must FAIL,
  // not silently record a false zero — DefiLlama should flag the data gap instead.
  const required = (v: any, label: string): number => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) {
      throw new Error(`Invalid ${label} for date ${options.dateString}: ${v}`);
    }
    return n;
  };
  // OPTIONAL aggregate (referral rebates): absent/invalid → 0 is correct (a day may
  // legitimately have no rebates, and the field predates its rollout on the feed).
  const optional = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };

  const volume = required(volRow.volume, "volume");
  const fees = required(feeRow.fees, "fees");
  // Referral rebates = commission paid back out to referrers (supply side). Capped at
  // the day's fees so revenue (fees − rebates) can't go negative and the split
  // reconciles: supplySide + revenue = fees.
  const rebates = Math.min(optional(rebateRow?.rebates), fees);
  const protocolNet = fees - rebates;

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  dailyVolume.addUSDValue(volume);
  dailyFees.addUSDValue(fees, METRIC.TRADING_FEES);
  dailySupplySideRevenue.addUSDValue(rebates);
  dailyRevenue.addUSDValue(protocolNet);
  dailyProtocolRevenue.addUSDValue(protocolNet);

  return {
    dailyVolume,
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue,
  };
};

const methodology = {
  Volume:
    "Real perpetual-futures notional (filled_quantity x filled_price) from Jetbit's " +
    "public aggregate feed; copy-trade mirror volume and display padding are excluded.",
  Fees: "Trading commission collected on perp trades (funding payments excluded).",
  // Note on the pool: Jetbit's single USDT pool is the trade COUNTERPARTY, so LPs
  // earn traders' net PnL (settled on-chain), NOT a share of trading commission —
  // that is a separate stream, not part of Fees. The one supply-side slice of the
  // commission is the referral program: a share of a referred user's fees paid back
  // out to their referrer. Reported as Supply-Side Revenue and netted from protocol
  // revenue.
  SupplySideRevenue: "Referral rebates — trading commission paid back out to referrers.",
  Revenue: "Trading commission retained by the protocol after referral rebates (fees − rebates).",
  ProtocolRevenue: "Trading commission retained by the Jetbit protocol treasury (fees − referral rebates).",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Trading commission charged on perp trades.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  chains: [CHAIN.OFF_CHAIN],
  fetch,
  start: "2026-07-04",
  methodology,
  breakdownMethodology,
};

export default adapter;
