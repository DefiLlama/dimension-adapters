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

const fetch = async (options: FetchOptions) => {
  const { d, row } = await rowFor(options);
  return {
    dailyActiveUsers: need(row.active_users, "active-user reading", d),
    dailyTransactionsCount: need(row.executions, "execution reading", d),
  };
};

// version 1: a daily-unique count cannot be summed from hourly slices.
const adapter: SimpleAdapter = {
  version: 1,
  adapter: { [CHAIN.CHAIN_GLOBAL]: { fetch, start: "2026-08-18" } },
  methodology: {
    ActiveUsers: "Distinct Amahub identities with a product action (trade, agent run, skill or chat) or a completed quest during the UTC day. Daily check-ins and app visits are excluded.",
    Transactions: "Successful executions routed through Amahub by users and their agents that UTC day, verified on chain, each counted once.",
  },
};

export default adapter;
