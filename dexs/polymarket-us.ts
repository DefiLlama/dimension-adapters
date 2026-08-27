import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

// Polymarket US is the CFTC-regulated venue, entirely separate from Polymarket International
// (dexs/polymarket): different hosts, different symbology, off-chain, no shared identifiers.
// It publishes its own execution tape and EOD contract summary as public CSVs, so unlike Kalshi
// and Polymarket International this needs no Dune query and is not an expensive adapter.
//
//   https://www.polymarketexchange.com/files/time-and-sales/YYYYMMDD-time-and-sales.csv
//   https://www.polymarketexchange.com/files/daily-market-report/YYYYMMDD-daily-market-report.csv
const FILES = "https://www.polymarketexchange.com/files";

const tapeUrl = (d: string) => `${FILES}/time-and-sales/${d}-time-and-sales.csv`;
const eodUrl = (d: string) => `${FILES}/daily-market-report/${d}-daily-market-report.csv`;

const getCsv = (url: string): Promise<string> =>
  httpGet(url, { responseType: "text", transformResponse: [(d: any) => d] });

/**
 * Volume is SUM(price * quantity) over the execution tape.
 *
 * `Last Price` is already the implied probability in dollars, 0.01..0.99 — NOT cents. Kalshi's
 * adapter divides by 100 because Kalshi quotes cents; copying that here understates this venue by
 * 100x. `Last Quantity` may be fractional: partial contracts rolled out 2026-06-11.
 *
 * Verified against the venue's own EOD report for business date 2026-08-25: summing the tape gives
 * 122,660,001.53 contracts against the report's 122,647,932.15 (0.01% apart, the residual being
 * late-reported trades), and all 52,424 traded symbols reconcile exactly per symbol.
 * $46,361,087.25 notional over 653,331 trades that day.
 */
function sumTape(csv: string): number {
  let volume = 0;
  const lines = csv.split("\n");
  // The tape has exactly 4 unquoted columns, so a plain split is safe here (the EOD report is not
  // so lucky — see sumOpenInterest).
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const parts = line.split(",");
    if (parts.length < 4) continue;
    const price = Number(parts[2]);
    const qty = Number(parts[3]);
    if (Number.isFinite(price) && Number.isFinite(qty)) volume += price * qty;
  }
  return volume;
}

/**
 * Open interest in contracts, summed across every contract in the EOD report.
 *
 * Each contract settles at $1, so contracts are also the dollar collateral outstanding — the same
 * convention dexs/kalshi.ts reports openInterestAtEnd in.
 *
 * `Description` (column 6) is a free-text question that contains commas and is quoted, so this
 * cannot split(',') the way the tape does. Only the fields up to Description are variable, so the
 * columns after it are addressed from the END of the row, which is stable at 21 columns.
 */
const EOD_COLUMNS = 21;
const OPEN_INTEREST_FROM_END = EOD_COLUMNS - 7;

function sumOpenInterest(csv: string): number {
  let oi = 0;
  const lines = csv.split("\n");
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const parts = line.split(",");
    if (parts.length < EOD_COLUMNS) continue;
    const value = Number(parts[parts.length - OPEN_INTEREST_FROM_END]);
    if (Number.isFinite(value)) oi += value;
  }
  return oi;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  // The venue's business date runs 17:00 ET to 17:00 ET, so it never aligns to a UTC day; business
  // date D covers 21 of the 24 hours of UTC day D (22:00Z-22:00Z under EST). Reporting on the
  // venue's own business date is both the closest single match and what the exchange itself
  // publishes against, which is the same choice dexs/kalshi.ts makes.
  const date = options.dateString.replace(/-/g, "");

  const [tape, eod] = await Promise.all([
    getCsv(tapeUrl(date)),
    getCsv(eodUrl(date)).catch(() => ""),
  ]);

  const dailyVolume = sumTape(tape);
  // The EOD report publishes up to a day behind the tape, so a missing report must not fail the
  // day's volume — it just leaves open interest unreported for that run.
  const openInterestAtEnd = eod ? sumOpenInterest(eod) : undefined;

  return { dailyVolume, openInterestAtEnd };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.OFF_CHAIN],
  // 20251029 exists but is a header-only file with no trades; the first day with fills is the 30th.
  start: '2025-10-30',
};

export default adapter;
