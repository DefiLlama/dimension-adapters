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
  return { dailyNewUsers: need(row.new_users_human, "new-user reading", d) };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: { [CHAIN.CHAIN_GLOBAL]: { fetch, start: "2026-08-19" } },
  methodology: {
    NewUsers: "Identities whose first product action or completed quest on Amahub happened during the UTC day. Identity records begin on 2026-08-17, so the series starts after the first two days.",
  },
};

export default adapter;
