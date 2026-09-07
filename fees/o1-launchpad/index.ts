import { Dependencies, FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const DUNE_MATERIALIZED_VIEW = "dune.stambouli_o1.result_daily_fee_revenue";

const MARKETS = ["Crypto", "Stocks"] as const;
type Market = typeof MARKETS[number];

type DuneFeeRevenueRow = {
  date: string;
  chain: string;
  market: string;
  fee_usd: number | string;
  revenue_usd: number | string;
};

const duneChainNames: Record<string, string> = {
  [CHAIN.BASE]: "Base",
  [CHAIN.ROBINHOOD]: "Robinhood",
};

const labels: Record<Market, { fees: string; revenue: string; supplySide: string }> = {
  Crypto: {
    fees: "Crypto Fees",
    revenue: "Crypto Fees to Protocol",
    supplySide: "Crypto Fees to Creators and Referrers",
  },
  Stocks: {
    fees: "Stocks Fees",
    revenue: "Stocks Fees to Protocol",
    supplySide: "Stocks Fees to Creators and Referrers",
  },
};

const assertOutsideMaterializedViewRefreshWindow = () => {
  const utcHour = new Date().getUTCHours();
  if (utcHour < 2) {
    throw new Error(
      "o1 Launchpad Dune materialized view is refreshing between 00:00 and 02:00 UTC",
    );
  }
};

const prefetch = async (options: FetchOptions) => {
  assertOutsideMaterializedViewRefreshWindow();

  return queryDuneSql(options, `
    SELECT date, chain, market, fee_usd, revenue_usd
    FROM ${DUNE_MATERIALIZED_VIEW}
    WHERE date = '${options.dateString}'
    ORDER BY chain, market
  `);
};

const toFiniteNonNegativeNumber = (
  value: number | string,
  field: "fee_usd" | "revenue_usd",
  row: DuneFeeRevenueRow,
) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(
      `Invalid ${field} for ${row.date} ${row.chain} ${row.market}: ${value}`,
    );
  }
  return parsed;
};

const createEmptyResult = (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
  };
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const result = createEmptyResult(options);

  const duneChainName = duneChainNames[options.chain];
  if (!duneChainName) throw new Error(`Unsupported o1 Launchpad chain ${options.chain}`);

  const rows = (options.preFetchedResults ?? []) as DuneFeeRevenueRow[];
  const chainRows = rows.filter((row) => row.chain === duneChainName);
  if (chainRows.length !== MARKETS.length) {
    throw new Error(
      `Expected ${MARKETS.length} o1 Launchpad Dune rows for ${duneChainName} on ${options.dateString}, received ${chainRows.length}`,
    );
  }

  for (const market of MARKETS) {
    const marketRows = chainRows.filter((row) => row.market === market);
    if (marketRows.length !== 1) {
      throw new Error(
        `Expected one o1 Launchpad Dune row for ${duneChainName} ${market} on ${options.dateString}, received ${marketRows.length}`,
      );
    }

    const row = marketRows[0];
    const fees = toFiniteNonNegativeNumber(row.fee_usd, "fee_usd", row);
    const revenue = toFiniteNonNegativeNumber(row.revenue_usd, "revenue_usd", row);
    if (revenue > fees) {
      throw new Error(
        `o1 Launchpad revenue exceeds fees for ${duneChainName} ${market} on ${options.dateString}: ${revenue} > ${fees}`,
      );
    }

    const supplySide = fees - revenue;
    const marketLabels = labels[market];
    result.dailyFees.addUSDValue(fees, marketLabels.fees);
    result.dailyRevenue.addUSDValue(revenue, marketLabels.revenue);
    result.dailySupplySideRevenue.addUSDValue(supplySide, marketLabels.supplySide);
  }

  return result;
};

const methodology = {
  Fees: "Quote-denominated swap fees plus token-launch fees, valued in USD at event time by the o1 Launchpad Dune materialized view.",
  Revenue: "The platform share of swap fees plus token-launch fees received by the protocol.",
  SupplySideRevenue: "Swap fees allocated to token creators and referrers.",
};

const breakdownMethodology = {
  Fees: Object.fromEntries(MARKETS.map((market) => [
    labels[market].fees,
    `${market} market swap and token-launch fees.`,
  ])),
  Revenue: Object.fromEntries(MARKETS.map((market) => [
    labels[market].revenue,
    `${market} market fees retained by the protocol.`,
  ])),
  SupplySideRevenue: Object.fromEntries(MARKETS.map((market) => [
    labels[market].supplySide,
    `${market} market swap fees allocated to token creators and referrers.`,
  ])),
};

const adapter: SimpleAdapter = {
  version: 1,
  prefetch,
  fetch,
  chains: [CHAIN.BASE, CHAIN.ROBINHOOD],
  start: "2026-07-01",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
