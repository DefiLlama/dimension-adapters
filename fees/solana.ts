import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { queryAllium } from "../helpers/allium";
import { CHAIN } from "../helpers/chains";
// import { queryDuneSql } from "../helpers/dune";

const SIMD_0096_ACTIVATION_DATE = 1739318400 // after 2025-02-12 priority fees will go 100% to validators;

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: async (options: FetchOptions) => {

        const dailyFees = options.createBalances()
        const dailyRevenue = options.createBalances()

        const alliumFeequery = `
          WITH total_fees_with_base_fee AS (
              SELECT
                  COUNT(*) AS tx_count,
                  SUM(fee) AS total_fees,
                  (COUNT(*) * 5000) AS total_base_fees
              FROM solana.raw.transactions
              WHERE block_timestamp BETWEEN TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND TO_TIMESTAMP_NTZ(${options.endTimestamp})
          )
          SELECT
              f.total_fees,
              f.total_base_fees AS total_base_fees,
              (f.total_fees - f.total_base_fees) AS total_priority_fees
          FROM total_fees_with_base_fee f
        `;

        const res = await queryAllium(alliumFeequery);
        // console.log(res);

        // const duneFeequery = `
        //   WITH total_fees_with_base_fee AS (
        //       SELECT
        //           COUNT(*) AS tx_count,
        //           SUM(fee) AS total_fees,
        //           (COUNT(*) * 5000) AS total_base_fees
        //       FROM solana.transactions
        //       WHERE TIME_RANGE
        //   )
        //   SELECT
        //       f.total_fees,
        //       f.total_base_fees AS total_base_fees,
        //       (f.total_fees - f.total_base_fees) AS total_priority_fees
        //   FROM total_fees_with_base_fee f
        //   `;
        // const res = await queryDuneSql(options, duneFeequery);
        // console.log(res);

        dailyFees.add('So11111111111111111111111111111111111111112', res[0].total_fees)
        dailyRevenue.add('So11111111111111111111111111111111111111112', res[0].total_base_fees / 2)
        if (options.endTimestamp < SIMD_0096_ACTIVATION_DATE) {
          // priority fees were going 50% to validator and remaining were getting burnt before SIMD-0096;
          dailyRevenue.add('So11111111111111111111111111111111111111112', res[0].total_priority_fees / 2)
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
