import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDune } from "../helpers/dune";
import ADDRESSES from "../helpers/coreAssets.json";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  // Query Dune for daily ETH revenue by day
  const results = await queryDune(
    "5443370",
    {},
    options
  );

  // Find the row matching our date
  const dateString = new Date(options.startOfDay * 1000).toISOString().split('T')[0];

  if (results && results.length > 0) {
    const dayData = results.find((row: any) =>
      row.day && row.day.startsWith(dateString)
    );

    if (dayData) {
      // Use revenue_value (in wei) instead of revenue_eth
      const revenueWei = dayData.revenue_value || (dayData.revenue_eth * 1e18).toString();
      if (revenueWei && revenueWei !== "0") {
        dailyFees.add(ADDRESSES.null, revenueWei);
      }
    }
  }

  return {
    dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BOB]: {
      fetch,
      start: "2024-05-01",
    },
  },
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
};

export default adapter;
