import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";

// Amahub perps: the Amadeus agent fleet's perpetual trades on Lighter and
// RISEx. Taker volume only, as the fleet reports each fill.
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
  return { dailyVolume: need(row.offhub_perp_taker_usd, "perp taker volume", d) };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: { [CHAIN.CHAIN_GLOBAL]: { fetch, start: "2026-09-25" } },
  doublecounted: true,
  methodology: {
    Volume: "Taker-side USD notional of perpetual trades executed by Amadeus agents on Lighter and RISEx, as reported per fill by the agent fleet and published by Amahub. Maker fills are excluded. The venues also count these trades.",
  },
};

export default adapter;
