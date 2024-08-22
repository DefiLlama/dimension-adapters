import { Adapter, FetchOptions, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.TRON]: {
      fetch: (async (options: FetchOptions) => {
        const dailyFees = options.createBalances();
        const logs = await options.getLogs({
          targets: ['TG9nDZMUtC4LBmrWSdNXNi8xrKzXTMMSKT'],
          eventAbi: "event TRXReceived(address indexed from,uint256 amount)",
        })
        logs.map((tx: any) => {
          dailyFees.addGasToken(tx.amount)
        })
        return { dailyFees, dailyRevenue: dailyFees, }
      }) as any,
      start: 0
    },
  },

}

export default adapter;
