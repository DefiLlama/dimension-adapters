import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { queryAllium } from "../helpers/allium";
import { CHAIN } from "../helpers/chains";

const SIMD_0096_ACTIVATION_DATE = 1739318400 // after 2025-02-12 priority fees will go 100% to validators;

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: async ({ createBalances, startTimestamp, endTimestamp, }: FetchOptions) => {

        const dailyFees = createBalances()
        const dailyRevenue = createBalances()

        const query = `
          SELECT 
            SUM(base_fee) as total_base_fees,
            SUM(priority_fee) as total_priority_fees,
            SUM(total_fee) as total_fees
          FROM solana.raw.fees
          WHERE block_timestamp BETWEEN TO_TIMESTAMP_NTZ(${startTimestamp}) AND TO_TIMESTAMP_NTZ(${endTimestamp})
        `

        const res = await queryAllium(query)

        dailyFees.add('So11111111111111111111111111111111111111112', res[0].total_fees)
        dailyRevenue.add('So11111111111111111111111111111111111111112', res[0].total_base_fees/2)
        if (endTimestamp < SIMD_0096_ACTIVATION_DATE) {
          // priority fees were going 50% to validator and remaining were getting burnt before SIMD-0096;
          dailyRevenue.add('So11111111111111111111111111111111111111112', res[0].total_priority_fees/2)
        }

        return {
          dailyFees,
          dailyRevenue,
          dailyHoldersRevenue: dailyRevenue,
        };
      },
      start: '2021-01-17',
    },
  },
  isExpensiveAdapter: true,
  protocolType: ProtocolType.CHAIN
}

export default adapter;
