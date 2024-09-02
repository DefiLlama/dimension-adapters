import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { Chain, } from "@defillama/sdk/build/general";
import { queryDune } from "../helpers/dune";

type TAddress = {
  [l: string | Chain]: string;
}
const address: TAddress = {
  [CHAIN.ETHEREUM]: '0x9008d19f58aabd9ed0d60971565aa8510560ab41',
  [CHAIN.XDAI]: '0x9008d19f58aabd9ed0d60971565aa8510560ab41'
}


const fetch = (_: Chain) => {
  return async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    try {
      const value = (await queryDune("3968762"));
      const dateStr = new Date(options.endTimestamp * 1000).toISOString().split("T")[0];
      const dayItem = value.find((item: any) => item.time.split(' ')[0] === dateStr);
      dailyFees.addGasToken((dayItem?.total_revenue) * 1e18 || 0)
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
      start: 1675382400,
      meta: {
        methodology
      }
    },
    // [CHAIN.XDAI]: {
    //   fetch: fetch(CHAIN.XDAI) as any,
    //   start: 1675382400,
    //   meta: {
    //     methodology
    //   }
    // }
  },
  isExpensiveAdapter: true,
}

export default adapter;
