import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../adapters/types";

// Amahub, the agent hub of Amadeus.
const ENDPOINT = "https://amahub.ama.one/api/metrics-public-daily";
const day = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 10);
async function rowFor(options: FetchOptions) {
  const d = day(options.startOfDay);
  const res = await httpGet(`${ENDPOINT}?from=${d}&to=${d}`);
  const row = (res?.days || []).find((r: any) => r.day === d && !r.partial);
  if (!row) throw new Error(`amadeus: no closed row for ${d}`);
  return { d, row };
}
const need = (v: any, what: string, d: string) => { if (v === null || v === undefined) throw new Error(`amadeus: ${d} has no ${what} yet`); return Number(v); };

// Global: Amahub identities and the executions they route, on every chain.
// Amadeus: Amahub on the Amadeus chain itself. A person signs an Amahub act
// there as a small AMA transfer to the hub's key (a "signed moment"); these
// are those transfers, read from every block of the day by Amahub's own scan.
const fetch = async (options: FetchOptions) => {
  const { d, row } = await rowFor(options);
  if (options.chain === CHAIN.AMADEUS) return {
    dailyActiveUsers: need(row.chain_day_amahub_signers, "Amahub signer count on Amadeus", d),
    dailyTransactionsCount: need(row.chain_day_amahub_transactions, "Amahub transaction count on Amadeus", d),
  };
  return {
    dailyActiveUsers: need(row.active_users, "active-user reading", d),
    dailyTransactionsCount: need(row.executions, "execution reading", d),
  };
};

// version 1: a daily-unique count cannot be summed from hourly slices.
const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.CHAIN_GLOBAL]: { fetch, start: "2026-08-18" },
    [CHAIN.AMADEUS]: { fetch, start: "2026-09-28" },
  },
  methodology: {
    ActiveUsers: "Global: distinct Amahub identities with a product action (trade, agent run, skill or chat) or a completed quest during the UTC day; daily check-ins and app visits are excluded. Amadeus: distinct wallets that signed an Amahub action on the Amadeus chain that UTC day (a successful AMA transfer to the Amahub hub key). A wallet active on Amadeus is usually also an Amahub identity, so the two are not additive.",
    Transactions: "Global: successful executions routed through Amahub by users and their agents that UTC day, verified on chain, each counted once. Amadeus: successful signed Amahub actions on the Amadeus chain that UTC day (AMA transfers to the Amahub hub key), read from every block.",
  },
};

export default adapter;
