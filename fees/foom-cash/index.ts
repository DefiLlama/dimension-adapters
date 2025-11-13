import { SimpleAdapter, type FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDune } from "../../helpers/dune";

const DUNE_QUERY_IDS: Record<string, string> = {
  [CHAIN.ETHEREUM]: "6198503",
  [CHAIN.BASE]: "6198559",
};

interface IDuneRow {
  day?: string;
  total_fees_usd?: string | number | null;
  total_revenue_usd?: string | number | null;
}

const num = (v: unknown) => Number(String(v ?? 0).replace(/,/g, ""));

function makeFetcher(chain: string) {
  const queryId = DUNE_QUERY_IDS[chain];

  return async (timestamp: number) => {
    if (!queryId) {
      return { dailyFees: 0, dailyRevenue: 0 };
    }

    const rows = (await queryDune(queryId, {}, { chain } as FetchOptions)) as IDuneRow[];
    if (!rows?.length) {
      return { dailyFees: 0, dailyRevenue: 0 };
    }

    const dayUTC = new Date(timestamp * 1000).toISOString().slice(0, 10);
    let feesUSD = 0;
    let revenueUSD = 0;

    for (const row of rows) {
      if (row.day === dayUTC) {
        feesUSD += num(row.total_fees_usd);
        revenueUSD += num(row.total_revenue_usd);
      }
    }

    return {
      dailyFees: feesUSD,
      dailyRevenue: revenueUSD
    };
  };
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: makeFetcher(CHAIN.ETHEREUM),
      start: 1751468483 // Jul-02-2025 03:01:23 PM UTC
    },
    [CHAIN.BASE]: {
      fetch: makeFetcher(CHAIN.BASE),
      start: 1748554693 // May-29-2025 09:38:13 PM +UTC
    },
  },
  methodology: {
    Fees:
      "All daily protocol fees: a 1% Generator fee, a 4% Investor fee, and all "
      + "relayer fees from both official and third-party relayers.",

    Revenue:
      "Protocol's retained fees: the 1% Generator fee, the 4% Investor fee, and "
      + "fees earned by the official relayer.",
    },
};

export default adapter;
