import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
const POTS_URL = "https://api.kaching.vip/pots";
async function fetchAllActivePots() {
  const pots: any[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const data = await httpGet(POTS_URL, {
      params: { page, limit: 100, status: "active", includePrivate: true },
    });
    pots.push(...data.pots);
    totalPages = data.totalPages;
    page++;
  } while (page <= totalPages);
  return pots;
}
const fetch = async () => {
  const pots = await fetchAllActivePots();
  const revenue = pots.reduce(
    (sum: number, pot: any) => sum + (pot.prizePool?.currentAmount ?? 0),
    0
  );
  return {
    dailyFees: revenue,
    dailyRevenue: revenue,
  };
};
const methodology = {
  Fees: "Revenue generated from lottery ticket purchases on the Kaching decentralized lottery platform.",
  Revenue: "Revenue generated from lottery ticket purchases on the Kaching decentralized lottery platform.",
};
const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2025-11-11",
  methodology,
};
export default adapter;
