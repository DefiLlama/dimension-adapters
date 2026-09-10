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

  const volRow = volRows.find((r) => r.date === options.dateString);
  const feeRow = feeRows.find((r) => r.date === options.dateString);

  if (!volRow || !feeRow) {
    throw new Error(`No data found for date ${options.dateString}`);
  }

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  // Only record finite, non-negative aggregates — a malformed feed row must never
  // write Infinity/NaN/negative amounts into the metrics (`Number(x) || 0` alone
  // would let Infinity and negatives through).
  const clean = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  dailyVolume.addUSDValue(clean(volRow.volume));
  dailyFees.addUSDValue(clean(feeRow.fees), METRIC.TRADING_FEES);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Volume:
    "Real perpetual-futures notional (filled_quantity x filled_price) from Jetbit's " +
    "public aggregate feed; copy-trade mirror volume and display padding are excluded.",
  Fees: "Trading commission collected on perp trades (funding payments excluded).",
  // On Jetbit the single USDT pool is the trade COUNTERPARTY: liquidity providers
  // earn traders' net PnL (settled on-chain), not a share of trading commission, so
  // there is no supply-side split of fees. Trading commission accrues to the protocol
  // treasury, hence Revenue = Protocol Revenue = Fees. (A referral program rebates up
  // to 5% of a referred user's fees as a downstream marketing cost — an expense, not a
  // supply-side fee stream, so it is not netted from Revenue here.)
  Revenue: "Trading commission, which accrues to the Jetbit protocol treasury.",
  ProtocolRevenue: "Trading commission collected by the protocol treasury.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Trading commission charged on perp trades.",
  },
  Revenue: {
    [METRIC.TRADING_FEES]: "Trading commission charged on perp trades.",
  },
  ProtocolRevenue: {
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
