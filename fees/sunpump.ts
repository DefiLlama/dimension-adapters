import { Adapter, FetchOptions, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.TRON]: {
      fetch: (async (options: FetchOptions) => {
        const dailyFees = options.createBalances();
        const start = await options.getFromBlock();
        const end = await options.getToBlock();
        const logs = []
        for(let i = start; i <= end; i+=2000) {
          const _logs = await options.getLogs({
            target: 'TG9nDZMUtC4LBmrWSdNXNi8xrKzXTMMSKT',
            eventAbi: "event TRXReceived(address indexed from,uint256 amount)",
            fromBlock: start,
            toBlock: start + 2000,
          })
          logs.push(..._logs)
        }
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
