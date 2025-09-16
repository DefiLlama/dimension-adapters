import ADDRESSES from '../helpers/coreAssets.json'
import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { queryAllium } from "../helpers/allium";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
// import { queryDuneSql } from "../helpers/dune";

const SIMD_0096_ACTIVATION_DATE = 1739318400 // after 2025-02-12 priority fees will go 100% to validators;

const adapter: Adapter = {
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: async (_t: any, _a: any, options: FetchOptions) => {

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
        
        dailyFees.add(ADDRESSES.solana.SOL, res[0].total_base_fees, METRIC.TRANSACTION_BASE_FEES)
        dailyFees.add(ADDRESSES.solana.SOL, res[0].total_priority_fees, METRIC.TRANSACTION_PRIORITY_FEES)
        
        // 50% base fees to validaotr, 50% base fees will be burned
        dailyRevenue.add(ADDRESSES.solana.SOL, res[0].total_base_fees / 2, METRIC.TRANSACTION_BASE_FEES)

        if (options.endTimestamp < SIMD_0096_ACTIVATION_DATE) {
          // priority fees were going 50% to validator and remaining were getting burnt before SIMD-0096;
          dailyRevenue.add(ADDRESSES.solana.SOL, res[0].total_priority_fees / 2, METRIC.TRANSACTION_PRIORITY_FEES)
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
  protocolType: ProtocolType.CHAIN,
  methodology: {
    Fees: 'Transaction fees paid by users',
    Revenue: 'Transaction base fees paid by users',
    HoldersRevenue: 'Transaction base fees paid by users were burned',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRANSACTION_BASE_FEES]: 'Transaction base fees paid by users',
      [METRIC.TRANSACTION_PRIORITY_FEES]: 'Transaction priority fees paid by users',
    },
    Revenue: {
      [METRIC.TRANSACTION_BASE_FEES]: '50% transaction base fees will be burned',
      [METRIC.TRANSACTION_PRIORITY_FEES]: 'Before 2025-02-12, 50% priority fees will be burned',
    },
    HoldersRevenue: {
      [METRIC.TRANSACTION_BASE_FEES]: '50% transaction base fees will be burned',
      [METRIC.TRANSACTION_PRIORITY_FEES]: 'Before 2025-02-12, 50% priority fees will be burned',
    },
  }
}

export default adapter;
