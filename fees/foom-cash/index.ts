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

const fetch = async (_: any, _1: any, options: FetchOptions) => {
  const queryId = DUNE_QUERY_IDS[options.chain];
  const rows = (await queryDune(queryId, {}, options)) as IDuneRow[];
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  for (const row of rows) {
    if (row['day'] === options.dateString) {
      dailyFees.addUSDValue(Number(row.total_fees_usd));
      dailyRevenue.addUSDValue(Number(row.total_revenue_usd));
    }
  }
  return { dailyFees, dailyRevenue };
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: {
    [CHAIN.ETHEREUM]: { start: '2025-07-01' },
    [CHAIN.BASE]: { start: '2025-05-28' },
  },
  methodology: {
    Fees: "All daily protocol fees: a 1% Generator fee, a 4% Investor fee, and all relayer fees from both official and third-party relayers.",
    Revenue: "Protocol's retained fees: the 1% Generator fee, the 4% Investor fee, and fees earned by the official relayer.",
  },
};

export default adapter;
