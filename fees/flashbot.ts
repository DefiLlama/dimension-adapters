import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql, getSqlFromFile } from "../helpers/dune";
import { METRIC } from "../helpers/metrics";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances()

  // https://dune.com/queries/4742045
  const sql = getSqlFromFile('helpers/queries/flashbots.sql', {
    start: options.startTimestamp,
    end: options.endTimestamp
  });

  const res = await queryDuneSql(options, sql);

  const dayItem = res[0]
  dailyFees.addGasToken((dayItem?.cum_proposer_revenue) * 1e18 || 0, METRIC.MEV_REWARDS)

  return {
    dailyFees,
    dailyRevenue: dailyFees,
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
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.MEV_REWARDS]: "ETH paid to block proposers as priority fees and direct payments from Flashbots MEV bundles.",
    },
    Revenue: {
      [METRIC.MEV_REWARDS]: "ETH paid to block proposers as priority fees and direct payments from Flashbots MEV bundles.",
    },
  },
}

export default adapter;
