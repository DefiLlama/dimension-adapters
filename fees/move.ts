import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const adapter: Adapter = {
  adapter: {
    [CHAIN.MOVE]: {
      fetch: (async (_: any, __: any, options: FetchOptions) => {
        const { startOfDay, createBalances } = options

        const dailyFees = createBalances()
        
        const dateString = new Date(startOfDay * 1000).toISOString().split('T')[0]
        const response = await fetchURL('https://storage.googleapis.com/explorer_stats/chain_stats_mainnet_v2.json');
        const dateItem = response.daily_gas_from_user_transactions.find((item: any) => item.date === dateString)
        if (!dateItem) {
          throw Error('no day data found!');
        }

        dailyFees.addCGToken('movement', Number(dateItem.gas_cost))
        
        return { dailyFees, dailyRevenue: dailyFees };
      }) as any,
      start: '2024-12-06',
    },
  },
  // isExpensiveAdapter: true,
  protocolType: ProtocolType.CHAIN,
  version: 1,
  methodology: {
    Fees: 'Total transaction fees paid by users',
    Revenue: 'Total transaction fees paid by users',
  }
}

export default adapter;
