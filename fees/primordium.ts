import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDune } from "../helpers/dune";

const fetch: any = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const value = (await queryDune("3521814", {
    start: options.startTimestamp,
    end: options.endTimestamp
  }));
  dailyFees.add('So11111111111111111111111111111111111111112', value[0].fee_token_amount);

  return { dailyFees }

}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
      start: 0,
    },
  },
  isExpensiveAdapter: true
};

export default adapter;
