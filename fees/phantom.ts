import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDune } from "../helpers/dune";

const fetch: any = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const value = (await queryDune("4313632", {
    start: options.startTimestamp,
    end: options.endTimestamp,
  }));
  value.forEach((v: any) => {
    dailyFees.add(v.token_mint_address, v.total_balance_change);
  });

  return { dailyFees, dailyRevenue: dailyFees }

}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
    },
  },
  isExpensiveAdapter: true
};

export default adapter;
