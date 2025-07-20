/*****************************************************************************************
 * fpex‑v3 Fees Adapter (Uniswap‑v3 style)
 * ----------------------------------------------------------------------------
 * – Queries daily & cumulative protocol fees from your fpex subgraph.
 * – Uses the UniswapDayData entity for the day’s fees
 *   and the Factory entity for the running total.
 *
 * Schema fields used
 * ------------------
 * • UniswapDayData.date      – UTC day‑start timestamp (seconds/86400)
 * • UniswapDayData.feesUSD   – fees earned that day, raw 1e18‑scaled integer¹
 * • Factory.totalFeesUSD     – cumulative fees, raw 1e18‑scaled integer¹
 *
 * ¹If your subgraph stores BigDecimal (already human‑readable), delete every “/ 1e18”
 *   in this file – they become no‑ops.
 *****************************************************************************************/

import { gql, request } from "graphql-request";
import type {
  ChainEndpoints,
  Fetch,
  FetchOptions,
} from "../../adapters/types";
import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

/* ────────────────────────────────────────────────────────────────────────────
   1.  ENDPOINT(S)
   ────────────────────────────────────────────────────────────────────────── */
const endpoints: ChainEndpoints = {
  /* If fpex lives on several chains, add more keys here. */
  [CHAIN.FLARE]:
    "https://api.goldsky.com/api/public/project_cmbnjfb9bfd3001tj08r4hq5c/subgraphs/flareswap/1.0.0/gn",
};

/* ────────────────────────────────────────────────────────────────────────────
   2.  TYPES
   ────────────────────────────────────────────────────────────────────────── */
interface IUniswapDayData {
  feesUSD: string;
}

interface IFactory {
  id: string;
  totalFeesUSD: string;
}

/* ────────────────────────────────────────────────────────────────────────────
   3.  CORE FETCHER  – decimal‑friendly version
   ────────────────────────────────────────────────────────────────────────── */
const graphs = (graphUrls: ChainEndpoints) => {
  const fetch: Fetch = async (_t, _b, options: FetchOptions) => {
    const dayStart = getTimestampAtStartOfDayUTC(options.startOfDay);

    const query = gql`
      query Fees($day: Int!) {
        dayData: uniswapDayDatas(where: { date: $day }) {
          feesUSD
        }
        factories(first: 1) {
          totalFeesUSD
        }
      }
    `;

    const res = await request(graphUrls[options.chain], query, { day: dayStart });
    const dayData: IUniswapDayData[] = res.dayData ?? [];
    const factories: IFactory[]       = res.factories ?? [];

    /* ------- use plain Number (or parseFloat) instead of BigInt ------- */
    let daily = 0;
    dayData.forEach((d) => { daily += Number(d.feesUSD); });

    const total = factories.length ? Number(factories[0].totalFeesUSD) : 0;

    return {
      timestamp: dayStart,
      dailyFees: daily.toString(),   // already human‑readable USD
      totalFees: total.toString(),   // idem
    };
  };
  return fetch;
};

/* ────────────────────────────────────────────────────────────────────────────
   4.  METHODOLOGY  (visible on DefiLlama UI)
   ────────────────────────────────────────────────────────────────────────── */
const methodology = {
  Fees:
    "Daily fees are taken from UniswapDayData.feesUSD; cumulative fees from Factory.totalFeesUSD. Both values originate in the subgraph and are denominated in USD.",
};

/* ────────────────────────────────────────────────────────────────────────────
   5.  ADAPTER EXPORT
   ────────────────────────────────────────────────────────────────────────── */
const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.FLARE]: {
      fetch: graphs(endpoints),
      start: "2025-07-05", /* <‑‑‑ EDIT if your subgraph starts earlier/later ‑‑‑> */
      meta: { methodology },
    },
  },
};

export default adapter;
