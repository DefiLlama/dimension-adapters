import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchBond } from "./bonds";
import { fetchRebases } from "./rebases";
import { fetchFeesFromShadow } from "./shadow";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  await fetchFeesFromShadow(dailyFees, options);
  await fetchBond(dailyFees, dailyRevenue, options);
  await fetchRebases(dailyHoldersRevenue, options);

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
  };
};

const methodology = {
  Fees:
    "Total fees accumulated by bond sales and trading fees from Protocol-Owned liquidity",
  Revenue: "10% of all bond sales and fees go to treasury",
  HoldersRevenue: "Rewards distributed to holders of staked RZR",
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SONIC]: {
      fetch,
      start: "2025-06-13",
    },
  },
  methodology,
  version: 2,
};

export default adapter;
