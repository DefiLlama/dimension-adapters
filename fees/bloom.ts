import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDune } from "../helpers/dune";

const fetchFees = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const res = await queryDune("4740596", {
    start: options.startTimestamp,
    end: options.endTimestamp,
    chain: options.chain
  });

  const dayItem = res[0]
  dailyFees.addUSDValue((dayItem?.fee_usd) || 0)

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetchFees,
    },
    [CHAIN.SOLANA]: {
      fetch: fetchFees,
    }
  },
  isExpensiveAdapter: true,
}

export default adapter;
