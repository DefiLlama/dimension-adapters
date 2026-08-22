import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";

const BASE_API_URL = "https://api.kaching.vip";

const fetchAptos = async (options: FetchOptions) => {
  const revenueResponse = await httpGet(`${BASE_API_URL}/transactions/revenue?timestamp=${options.startOfDay}`);
  if (!revenueResponse.today.revenue) {
    throw new Error(`No data found for date ${options.dateString}`);
  }

  // Revenue is in USDC
  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(Number(revenueResponse.today.revenue), "Lottery Ticket Purchase Fees");

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
}

const TICKET_PURCHASES_URL = "https://api.kaching.vip/transactions/ticket-purchases";
const PAGE_LIMIT = 50;
const MAX_PAGES = 200;

const fetchSolana = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  let page = 1;

  while (page <= MAX_PAGES) {
    const data = await httpGet(TICKET_PURCHASES_URL, {
      params: { startDate: options.dateString, endDate: options.dateString, page, limit: PAGE_LIMIT },
    });

    const rows: any[] = data?.data ?? [];
    if (!rows.length) {
      throw new Error(`No data found for date ${options.dateString}`);
    }

    for (const row of rows) {
      const amt = Number(row.amount ?? 0);
      if (isFinite(amt) && amt > 0) dailyFees.addUSDValue(amt, "Lottery Ticket Purchase Fees");
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

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
}

const methodology = {
  Fees: "Revenue generated from lottery ticket purchases on the Kaching decentralized lottery platform.",
  Revenue: "Revenue generated from lottery ticket purchases on the Kaching decentralized lottery platform.",
};

const breakdownMethodology = {
  Fees: {
    "Lottery Ticket Purchase Fees": "Fees paid by users for purchasing lottery tickets.",
  },
  Revenue: {
    "Lottery Ticket Purchase Fees": "Fees paid by users for purchasing lottery tickets.",
  },
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.APTOS]: {
      fetch: fetchAptos,
      start: '2025-11-11',
      deadFrom: '2026-05-15'
    },
    [CHAIN.SOLANA]: {
      fetch: fetchSolana,
      start: '2026-05-16',
    }
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
