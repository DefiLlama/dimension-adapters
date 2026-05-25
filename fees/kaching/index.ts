import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";

const BASE_API_URL = "https://api.kaching.vip";

const fetchAptos = async (_a: any, _b: any, options: FetchOptions) => {
  const revenueResponse = await httpGet(`${BASE_API_URL}/transactions/revenue?timestamp=${options.startOfDay}`);

  // Revenue is in USDC
  const revenue = Number(revenueResponse.today.revenue)

  return {
    dailyFees: revenue,
    dailyRevenue: revenue,
  };
}

const POTS_URL = "https://api.kaching.vip/pots";
const MAX_PAGES = 100;

async function fetchAllActivePots() {
  const pots: any[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const data = await httpGet(POTS_URL, {
      params: { page, limit: 100, status: "active", includePrivate: true },
    });
    if (!data?.pots) break;
    pots.push(...data.pots);
    totalPages = data.totalPages;
    page++;
  } while (page <= totalPages && page <= MAX_PAGES);
  return pots;
}

const fetchSolana = async (_a: any, _b: any, options: FetchOptions) => {
  const pots = await fetchAllActivePots();
  const revenue = pots.reduce(
    (sum: number, pot: any) => sum + (pot.prizePool.currentAmount),
    0
  );

  if (!isFinite(revenue)) {
    throw new Error(`Invalid revenue value: ${revenue}`);
  }

  return {
    dailyFees: revenue,
    dailyRevenue: revenue,
  };
}

const methodology = {
  Fees: "Revenue generated from lottery ticket purchases on the Kaching decentralized lottery platform.",
  Revenue: "Revenue generated from lottery ticket purchases on the Kaching decentralized lottery platform.",
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.APTOS]: {
      fetch: fetchAptos,
      start: '2025-11-11',
      deadFrom: '2026-05-15'
    },
    [CHAIN.SOLANA]: {
      fetch: fetchSolana,
    }
  },
  runAtCurrTime: true,
  methodology,
};

export default adapter;
