import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

// The Amadeus chain.
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
  return { dailyNewUsers: need(row.chain_day_new_signers, "new-signer count", d) };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.AMADEUS],
  protocolType: ProtocolType.CHAIN,
  start: "2026-09-01",
  methodology: {
    NewUsers: "Addresses that signed their first successful transaction on Amadeus during the UTC day (first appearance since 2026-08-11).",
  },
};

export default adapter;
