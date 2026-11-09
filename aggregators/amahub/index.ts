import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";

// Amahub (https://amahub.ama.one), the agent hub of Amadeus. Users and their
// agents route swaps and DCA/limit orders through aggregators and DEXs
// (LI.FI, KyberSwap, ParaSwap, Uniswap, Jupiter, NEAR Intents, ...) on many
// chains. Volume = Executed Agent Value: successful executions amahub verified
// on chain, priced at execution time, each counted once.
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
  if (row.eav_basis !== "rows") throw new Error(`amadeus: ${d} is not on the exact per-row basis`);
  return { dailyVolume: need(row.eav_usd, "executed value", d) };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: { [CHAIN.CHAIN_GLOBAL]: { fetch, start: "2026-08-14" } },
  doublecounted: true,
  methodology: {
    Volume: "USD value of successful swap and order executions routed through Amahub by users and their agents, verified on chain by Amahub, priced at execution time and counted once. Platform-wide across all supported chains. The same trades are also counted by the underlying DEXs and aggregators.",
  },
};

export default adapter;
