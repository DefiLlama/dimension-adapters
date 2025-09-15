import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const adapter: Adapter = {
  adapter: {
    [CHAIN.MOVE]: {
      fetch: (async (_: any, __: any, options: FetchOptions) => {
        const { startOfDay, createBalances } = options

        const dailyFees = createBalances()

        // const feeQuery = await queryFlipside(`
        //   SELECT 
        //     SUM(gas_used * gas_unit_price)/pow(10,8)
        //   FROM movement.core.fact_transactions
        //   WHERE SUCCESS AND 
        //   block_timestamp BETWEEN TO_TIMESTAMP_NTZ(${startTimestamp}) AND TO_TIMESTAMP_NTZ(${endTimestamp})
        // `, 260)

        // const fees = Number(feeQuery[0][0])
        // dailyFees.addCGToken('movement', fees)
        
        const dateString = new Date(startOfDay * 1000).toISOString().split('T')[0]
        const response = await fetchURL('https://storage.googleapis.com/explorer_stats/chain_stats_mainnet_v2.json');
        for (const item of response.daily_gas_from_user_transactions) {
          if (item.date === dateString) {
            dailyFees.addCGToken('movement', Number(item.gas_cost))
          }
        }
        
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
