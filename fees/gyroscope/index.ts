import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";
import { queryDune } from "../helpers/dune";

const fetch = (_: Chain) => {
  return async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    try {
      const value = await queryDune("4776022", {});
      const lastRecord = value[0];
      
      const feeValue = (lastRecord?.daily_diff_eth_value || 0) * 1e18;
      dailyFees.add("eth", feeValue);
      
      return { dailyFees };
    } catch (e) {
      return { dailyFees };
    }
  };
};

const methodology = {
  dailyFees: "Combines reserve asset yield and protocol fees on swap fee revenue.",
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch(CHAIN.ETHEREUM) as any,
      meta: {
        methodology,
      },
    },
  },
  isExpensiveAdapter: true,
};

export default adapter;
