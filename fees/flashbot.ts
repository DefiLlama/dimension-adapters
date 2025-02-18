import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDune } from "../helpers/dune";

const fetchFees = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const res = await queryDune("4742045", {
    start: options.startTimestamp,
    end: options.endTimestamp,
  });

  const dayItem = res[0]
  dailyFees.addGasToken((dayItem?.cum_proposer_revenue) * 1e18 || 0)

  return {
    dailyFees
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchFees,
    },
  },
  isExpensiveAdapter: true,
}

export default adapter;
