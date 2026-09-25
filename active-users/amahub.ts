import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

// amahub (https://amahub.ama.one) — an agent platform on the Amadeus protocol.
// Active users = distinct wallet addresses that earned campaign points that UTC
// day: a daily check-in, a verified quest completion, or a product action
// (a swap, a skill run, an agent use), deduplicated by address across the
// platform's ledger and its loyalty provider. Transactions = successful,
// verified executions (swaps and orders) routed by users and their agents.
// Published by amahub's public daily metrics endpoint, one row per closed
// UTC day since the campaign start on 2026-08-11; a day with no reading is an
// error here, never a zero.
const ENDPOINT = "https://amahub.ama.one/api/metrics-public-daily";
const day = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 10);

const fetch = async (options: FetchOptions) => {
  const d = day(options.startOfDay);
  const res = await httpGet(`${ENDPOINT}?from=${d}&to=${d}`);
  const row = (res?.days || []).find((r: any) => r.day === d);
  if (!row) throw new Error(`amahub: no row for ${d}`);
  if (row.total_dau === null || row.total_dau === undefined) throw new Error(`amahub: ${d} has no active-user reading`);
  return {
    dailyActiveUsers: row.total_dau,
    dailyTransactionsCount: row.executions ?? undefined,
  };
};

// version 1: a daily-unique count cannot be summed from hourly slices.
const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.CHAIN_GLOBAL],
  start: "2026-08-11",
  methodology: {
    ActiveUsers: "Distinct wallet addresses that earned campaign points on amahub that UTC day (daily check-in, verified quest completion, or a product action such as a swap, skill run or agent use), deduplicated across amahub's ledger and its loyalty provider. Platform-wide across all supported chains.",
    Transactions: "Successful, verified swap and order executions routed through amahub by users and their agents that UTC day, each counted once.",
  },
};

export default adapter;
