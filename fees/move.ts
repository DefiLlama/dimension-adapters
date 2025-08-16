import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryFlipside } from "../helpers/flipsidecrypto";

const adapter: Adapter = {
  adapter: {
    [CHAIN.MOVE]: {
      fetch: (async (options: FetchOptions) => {
        const { startTimestamp, endTimestamp, createBalances, } = options

        const dailyFees = createBalances()

        const feeQuery = await queryFlipside(`
          SELECT 
            SUM(gas_used * gas_unit_price)/pow(10,8)
          FROM movement.core.fact_transactions
          WHERE SUCCESS AND 
          block_timestamp BETWEEN TO_TIMESTAMP_NTZ(${startTimestamp}) AND TO_TIMESTAMP_NTZ(${endTimestamp})
        `, 260)

        const fees = Number(feeQuery[0][0])
        dailyFees.addCGToken('movement', fees)
        return { dailyFees, dailyRevenue: dailyFees };

      }) as any,
      start: '2024-12-06',
    },
  },
  isExpensiveAdapter: true,
  protocolType: ProtocolType.CHAIN,
  version: 2,
  methodology: {
    Fees: 'Total transaction fees paid by users',
    Revenue: 'Total transaction fees paid by users'
  }
}

export default adapter;
