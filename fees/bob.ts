import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../helpers/dune";
import ADDRESSES from "../helpers/coreAssets.json";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  const sql_query = getSqlFromFile('helpers/queries/bob-blockchain.sql', {
    start: options.startTimestamp,
    end: options.endTimestamp,
  })
  const results = await queryDuneSql(options, sql_query);

  const dateString = new Date(options.startOfDay * 1000).toISOString().split('T')[0];
  if (results && results.length > 0) {
    const dayData = results.find((row: any) => row.day && row.day.startsWith(dateString));

    if (dayData) {
      // Use revenue_value (in wei) instead of revenue_eth
      const revenueWei = dayData.revenue_value || (dayData.revenue_eth * 1e18).toString();
      if (revenueWei && revenueWei !== "0") {
        dailyFees.add(ADDRESSES.null, revenueWei, 'sequencer fees');
        dailyRevenue.add(ADDRESSES.null, revenueWei, 'sequencer fees');
      }
    }
  }

  return {
    dailyFees,
    dailyRevenue,
  };
};

const methodology = {
  Fees: "All fees collected by the Bob L2 sequencer from transaction processing.",
  Revenue: "All revenue collected by the Bob L2 sequencer from transaction processing.",
};

const breakdownMethodology = {
  Fees: {
    'sequencer fees': 'All fees collected by the Bob L2 sequencer from transaction processing.',
  },
  Revenue: {
    'sequencer fees': 'All revenue collected by the Bob L2 sequencer from transaction processing.',
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  methodology,
  breakdownMethodology,
  chains: [CHAIN.BOB],
  start: "2024-04-12",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
};

export default adapter;
