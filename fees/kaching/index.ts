import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

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

const fetch = async (_a: any, _b: any, _options: FetchOptions) => {
  try {
    const pots = await fetchAllActivePots();
    const revenue = pots.reduce(
      (sum: number, pot: any) => sum + (pot.prizePool?.currentAmount ?? 0),
      0
    );

    if (!isFinite(revenue)) {
      throw new Error(`Invalid revenue value: ${revenue}`);
    }

    return {
      dailyFees: revenue,
      dailyRevenue: revenue,
    };
  } catch (e) {
    console.error("Kaching fee fetch error:", e);
    return { dailyFees: 0, dailyRevenue: 0 };
  }
};

const methodology = {
  Fees: "Revenue generated from lottery ticket purchases on the Kaching decentralized lottery platform.",
  Revenue: "Revenue generated from lottery ticket purchases on the Kaching decentralized lottery platform.",
};

const breakdownMethodology = {
  Fees: {
    "Lottery Ticket Sales": "Fees collected from lottery ticket purchases on the Kaching platform (USDC).",
  },
  Revenue: {
    "Lottery Ticket Sales To Protocol": "Protocol revenue retained from lottery ticket purchases (USDC).",
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
