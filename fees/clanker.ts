import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDune } from "../helpers/dune";

const fetchFees = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const res = await queryDune("4343160", {
    start: options.startTimestamp,
    end: options.endTimestamp,
  })
  dailyFees.addUSDValue(res[0].daily_fees);
  return {
    dailyFees: dailyFees,
    dailyRevenue: dailyFees,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetchFees,
      start: "2024-11-22",
    },
  },
}

export default adapter;
