import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql, getSqlFromFile } from "../helpers/dune";
import { METRIC } from "../helpers/metrics";

const fetch = async (options: FetchOptions) => {
  // Workaround for dune indexing issue
  const now = Date.now()
  const tenHoursAgo = now - (10 * 60 * 60 * 1000)
  if ((options.toTimestamp * 1000) > tenHoursAgo) {
      console.log("End timestamp is less than 10 hours ago, skipping fetch due to dune indexing delay", new Date(options.toTimestamp * 1000).toISOString(), new Date(tenHoursAgo).toISOString())
      throw new Error("End timestamp is less than 10 hours ago, skipping due to dune indexing delay")
  }

  const dailyFees = options.createBalances()

  // https://dune.com/queries/4742045
  const sql = getSqlFromFile('helpers/queries/flashbots.sql', {
    start: options.startTimestamp,
    end: options.endTimestamp
  });

  const res = await queryDuneSql(options, sql);

  const dayItem = res[0]
  if (!dayItem || dayItem.cum_proposer_revenue == null ) {
    throw new Error('Dune query returned no results');
  }

  dailyFees.addGasToken((dayItem.cum_proposer_revenue) * 1e18 || 0, METRIC.MEV_REWARDS)

  return {
    dailyFees,
    dailySupplySideRevenue: dailyFees,
    dailyRevenue: 0,
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ETHEREUM],
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Fees: 'Total ETH fees paid to block proposers by users.',
    Revenue: 'Flashbots gets no fees share.',
    SupplySideRevenue: 'All ETH fees paid to block proposers.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.MEV_REWARDS]: "ETH paid to block proposers as priority fees and direct payments from Flashbots MEV bundles.",
    },
    SupplySideRevenue: {
      [METRIC.MEV_REWARDS]: "All ETH paid to block proposers as priority fees and direct payments from Flashbots MEV bundles.",
    },
  },
}

export default adapter;
