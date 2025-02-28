import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { Chain, } from "@defillama/sdk/build/general";
import { queryDune } from "../helpers/dune";
import { getTimestampAtStartOfDay } from "../utils/date";

const fetch = (_: Chain) => {
  return async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    try {
      const startOfDay = getTimestampAtStartOfDay(options.startOfDay);
      const value = (await queryDune("4736286", { start: startOfDay }));
      const dayItem = value[0]
      dailyFees.addGasToken((dayItem?.eth_value) * 1e18 || 0)
      return {
        dailyFees: dailyFees,
        dailyRevenue: dailyFees,
      }
    } catch (e) {
      return {
        dailyFees: dailyFees,
        dailyRevenue: dailyFees,
      }
    }
  }
}

const methodology = {
  UserFees: "Trading fees",
  Fees: "Trading fees",
  Revenue: "Trading fees - transation fees",
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch(CHAIN.ETHEREUM) as any,
      start: '2023-02-03',
      meta: {
        methodology
      }
    },
    // [CHAIN.XDAI]: {
    //   fetch: fetch(CHAIN.XDAI) as any,
    //   start: '2023-02-03',
    //   meta: {
    //     methodology
    //   }
    // }
  },
  isExpensiveAdapter: true,
}

export default adapter;
