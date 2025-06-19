import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchBond } from "./bonds";
import { fetchFeesFromShadow } from "./shadow";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  await fetchFeesFromShadow(dailyFees, options);
  await fetchBond(dailyFees, dailyRevenue, options);

  return {
    dailyFees,
    dailyRevenue,
  };
};

const methodology = {
  Fees: "Total fees accumulated by protocol-owned liquidity measured by k value growth",
  Revenue: "10% of all bond sales go to treasury",
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SONIC]: {
      fetch,
      start: "2025-06-13",
      meta: {
        methodology,
      },
    },
  },
  version: 2,
};

export default adapter;
