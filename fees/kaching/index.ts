import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const TICKET_PURCHASES_URL =
  "https://api.kaching.vip/transactions/ticket-purchases";
const PAGE_LIMIT = 50;
const MAX_PAGES = 200;

function toDateStr(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

// Fetch all ticket purchases for the given day and return the total USDC amount.
// Throws if pagination exceeds MAX_PAGES to avoid silently returning partial data.
async function fetchDailyRevenue(date: string): Promise<number> {
  let total = 0;
  let page = 1;

  while (page <= MAX_PAGES) {
    const data = await httpGet(TICKET_PURCHASES_URL, {
      params: { startDate: date, endDate: date, page, limit: PAGE_LIMIT },
    });

    const rows: any[] = data?.data ?? [];
    if (!rows.length) break;

    for (const row of rows) {
      const amt = Number(row.amount ?? 0);
      if (isFinite(amt) && amt > 0) total += amt;
    }

    const totalPages: number = data?.totalPages ?? 1;

    // Guard: if actual page count exceeds our cap, fail loudly rather than
    // return a silent undercount.
    if (totalPages > MAX_PAGES) {
      throw new Error(
        `Kaching: totalPages (${totalPages}) exceeds MAX_PAGES (${MAX_PAGES}). Partial data would be returned — aborting.`
      );
    }

    if (page >= totalPages) break;
    page++;
  }

  return total;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  try {
    // options.startOfDay is always midnight UTC of the day being analyzed
    const date = toDateStr(options.startOfDay);

    const dailyRevenue = await fetchDailyRevenue(date);
    console.log(`Kaching: ${date} → $${dailyRevenue.toFixed(2)} USDC`);

    return {
      dailyFees: dailyRevenue,
      dailyRevenue,
    };
  } catch (e) {
    console.error("Kaching fee fetch error:", e);
    return { dailyFees: 0, dailyRevenue: 0 };
  }
};

const methodology = {
  Fees: "Sum of all lottery ticket purchase amounts (USDC) on the Kaching decentralized lottery platform.",
  Revenue:
    "Sum of all lottery ticket purchase amounts (USDC) on the Kaching decentralized lottery platform.",
};

const breakdownMethodology = {
  Fees: {
    "Ticket Purchases":
      "USDC paid by users to purchase lottery tickets on the Kaching platform.",
  },
  Revenue: {
    "Ticket Purchases":
      "USDC revenue collected from lottery ticket sales on the Kaching platform.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2025-11-11",
  methodology,
  breakdownMethodology,
};

export default adapter;
