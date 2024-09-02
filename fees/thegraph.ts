import { Adapter, FetchOptions, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: (async (options: FetchOptions) => {
        const dailyFees = options.createBalances();
        const logs = await options.getLogs({
          targets: ['0x1B07D3344188908Fb6DEcEac381f3eE63C48477a'],
          eventAbi: "event TokensPulled(address indexed user,uint256 amount)",
        })
        logs.map((tx: any) => {
          dailyFees.add("0x9623063377ad1b27544c965ccd7342f7ea7e88c7", tx.amount)
        })
        return { dailyFees, dailyRevenue: dailyFees, }
      }) as any,
      start: 0
    },
  },

}

export default adapter;
