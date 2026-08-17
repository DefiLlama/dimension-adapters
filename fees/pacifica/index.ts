import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

// Pacifica is a Solana perpetuals DEX with an off-chain matching engine, so
// fills never settle individually on-chain, but it exposes every fill's actual
// fee through its public trade-history feed. We sum the real fees paid (net of
// maker rebates) instead of estimating from volume x a base rate.
//
// GET /api/v1/trades/history (no account) is the global, protocol-wide fill
// feed. Each fill's `fee` is in USD, positive for takers and negative for maker
// rebates, so the signed sum over a day is the net trading fee. The endpoint is
// header-gated (needs a browser User-Agent + Origin), caps a page at 4000 rows,
// and paginates with a `next_cursor` / `has_more` cursor bounded to the
// start_time/end_time window.
const HISTORY_URL = "https://api.pacifica.fi/api/v1/trades/history";
const HEADERS = { "User-Agent": "Mozilla/5.0", Origin: "https://app.pacifica.fi" };
const PAGE_LIMIT = 4000;
// A UTC day of Pacifica fills is ~165 pages; cap well above that so a
// never-terminating `has_more` fails loudly instead of looping forever.
const MAX_PAGES = 5000;

interface Fill {
  event_type: string;
  fee: string;
}

interface HistoryPage {
  success?: boolean;
  data: Fill[];
  has_more?: boolean;
  next_cursor?: string | null;
}

// httpGet has no retry, and a day is ~165 sequential requests, so retry a
// transient failure a few times before letting it fail the day.
const fetchPage = async (startMs: number, endMs: number, cursor: string | null): Promise<HistoryPage> => {
  let url = `${HISTORY_URL}?start_time=${startMs}&end_time=${endMs}&limit=${PAGE_LIMIT}`;
  if (cursor) url += `&cursor=${cursor}`;
  for (let attempt = 0; ; attempt++) {
    try {
      const page: HistoryPage = await httpGet(url, { headers: HEADERS });
      // Fail loudly rather than return a partial (undercounted) day: a
      // { success: false } body or a 403 from the Origin gate must surface.
      if (page?.success === false || !Array.isArray(page?.data)) {
        throw new Error("Pacifica: trades/history returned no data (endpoint blocked or changed)");
      }
      return page;
    } catch (e) {
      if (attempt >= 2) throw e;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  // Clean UTC day [00:00:00, next 00:00:00). end_time is exclusive, and
  // startOfDay / endTimestamp are the calendar-exact boundaries (fromTimestamp
  // and toTimestamp are shifted a second early).
  const startMs = options.startOfDay * 1000;
  const endMs = options.endTimestamp * 1000;

  let dailyFees = 0;
  let cursor: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, has_more, next_cursor } = await fetchPage(startMs, endMs, cursor);
    for (const fill of data) {
      // Only perp fills carry a trading `fee`; spot fills (spot_fee) and any
      // non-fill events are excluded, matching the perps-only dexs/pacifica.
      if (fill.event_type === "fulfill_taker" || fill.event_type === "fulfill_maker") {
        const fee = Number(fill.fee);
        if (!Number.isFinite(fee)) {
          throw new Error(`Pacifica: non-numeric fee ${fill.fee}`);
        }
        dailyFees += fee;
      }
    }
    if (!has_more || !next_cursor) return { dailyFees, dailyUserFees: dailyFees };
    cursor = next_cursor;
  }

  throw new Error("Pacifica: trades/history did not finish paginating within MAX_PAGES");
};

const methodology = {
  Fees: "Actual trading fees paid on Pacifica's perpetual markets, summed from every fill in the protocol-wide trade-history feed. Net of maker rebates (taker fees are positive, maker rebates negative), so it reflects real fees paid rather than a volume-based estimate.",
  UserFees: "All trading fees are paid by the traders, net of maker rebates.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2025-06-09', // earliest Pacifica trade-history data
  methodology,
};

export default adapter;
