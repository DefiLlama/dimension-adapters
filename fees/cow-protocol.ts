import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { Chain, } from "@defillama/sdk/build/general";
import { getSqlFromFile, queryDuneSql } from "../helpers/dune";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const fetch = (_: Chain) => {
  return async (_a: any, _ts: any, options: FetchOptions) => {
    const dailyFees = options.createBalances();
    try {
      const startOfDay = getTimestampAtStartOfDayUTC(options.startOfDay);
      // https://dune.com/queries/4736286
      const sql = getSqlFromFile("helpers/queries/cow-protocol.sql", {
        start: startOfDay
      });
      const value = (await queryDuneSql(options, sql));
      const dayItem = value[0]
      dailyFees.addGasToken((dayItem?.eth_value) * 1e18 || 0)
      return {
        dailyFees,
        dailyRevenue: dailyFees,
      }
    } catch (e) {
      return {
        dailyFees,
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
  version: 1,
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
