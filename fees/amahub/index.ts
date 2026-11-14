import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";

// Amahub (https://amahub.ama.one), the agent hub of Amadeus. Amahub charges a
// trade fee on swaps (sent to its fee wallet inside the swap transaction) and
// a builder fee on perpetual orders it routes. Fees = the sum, in USD, of the
// fee each successful, on-chain verified execution paid to Amahub that UTC
// day, read off the server-stored build that charged it. The venue's own
// fees, network gas and the Amadeus chain fee are not included.
const ENDPOINT = "https://amahub.ama.one/api/metrics-public-daily";
const day = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 10);
const need = (v: any, what: string, d: string) => { if (v === null || v === undefined) throw new Error(`amahub: ${d} has no ${what} yet`); return Number(v); };

const fetch = async (options: FetchOptions) => {
  const d = day(options.startOfDay);
  const res = await httpGet(`${ENDPOINT}?from=${d}&to=${d}`);
  const row = (res?.days || []).find((r: any) => r.day === d && !r.partial);
  if (!row) throw new Error(`amahub: no closed row for ${d}`);
  if (row.eav_basis !== "rows") throw new Error(`amahub: ${d} is not on the exact per-row basis`);
  const total = need(row.fees_usd, "fees", d);
  const perp = need(row.perp_fees_usd, "perp fees", d);

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(total - perp, "Swap fees");
  dailyFees.addUSDValue(perp, "Perp builder fees");

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: { [CHAIN.CHAIN_GLOBAL]: { fetch, start: "2026-11-01" } },
  methodology: {
    Fees: "Trade fees users pay to Amahub: the swap fee on spot trades and the builder fee on perpetual orders routed through Amahub, verified on chain and counted once per execution.",
    Revenue: "All trade fees are kept by Amahub.",
    ProtocolRevenue: "All trade fees go to Amahub.",
  },
  breakdownMethodology: {
    Fees: {
      "Swap fees": "Fee charged on spot swaps routed through Amahub, paid to the Amahub fee wallet inside the swap transaction.",
      "Perp builder fees": "Amahub's builder fee on perpetual orders it routes (the venue's own trading fee is excluded).",
    },
  },
};

export default adapter;
