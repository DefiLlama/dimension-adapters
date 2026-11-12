import ADDRESSES from '../helpers/coreAssets.json'
import { Adapter, Dependencies, FetchOptions, ProtocolType } from "../adapters/types";
import { queryAllium } from "../helpers/allium";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
// import { queryDuneSql } from "../helpers/dune";

const SIMD_0096_ACTIVATION_DATE = 1739318400 // after 2025-02-12 priority fees will go 100% to validators;
const PRIORITY_FEES_REQUIRED_FROM = 1704067200 // 2024-01-01, from here priority fee txs land every few seconds, so missing or stale rows mean Allium lag

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()

  const alliumFeequery = `
    WITH txs AS (
        SELECT
            SUM(fee) AS total_fees,
            MAX(block_timestamp) AS txs_max_ts
        FROM solana.raw.transactions
        WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
    ), priority AS (
        SELECT
            SUM(priority_fee) AS total_priority_fees,
            MAX(block_timestamp) AS fees_max_ts
        FROM solana.raw.fees
        WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
    )
    SELECT
        total_fees,
        total_priority_fees,
        DATEDIFF('second', fees_max_ts, txs_max_ts) AS fees_lag_seconds
    FROM txs CROSS JOIN priority
  `;

  const res = await queryAllium(alliumFeequery);
  const row = res[0]
  if (!row || row.total_fees == null) throw new Error('Missing Solana transaction fees')
  const totalFees = Number(row.total_fees)
  if (options.startTimestamp >= PRIORITY_FEES_REQUIRED_FROM) {
    if (row.total_priority_fees == null) throw new Error('Missing Solana priority fees')
    if (Number(row.fees_lag_seconds) > 600) throw new Error('solana.raw.fees is lagging solana.raw.transactions')
  }
  const totalPriorityFees = row.total_priority_fees == null ? 0 : Number(row.total_priority_fees)
  if (!Number.isFinite(totalFees) || !Number.isFinite(totalPriorityFees) || totalPriorityFees < 0 || totalPriorityFees > totalFees) {
    throw new Error('Invalid Solana priority fees')
  }
  const totalBaseFees = totalFees - totalPriorityFees

  dailyFees.add(ADDRESSES.solana.SOL, totalBaseFees, METRIC.TRANSACTION_BASE_FEES)
  dailyFees.add(ADDRESSES.solana.SOL, totalPriorityFees, METRIC.TRANSACTION_PRIORITY_FEES)

  // 50% base fees to validator, 50% base fees will be burned
  dailyRevenue.add(ADDRESSES.solana.SOL, totalBaseFees / 2, METRIC.TRANSACTION_BASE_FEES)

  if (options.endTimestamp < SIMD_0096_ACTIVATION_DATE) {
    // priority fees were going 50% to validator and remaining were getting burnt before SIMD-0096;
    dailyRevenue.add(ADDRESSES.solana.SOL, totalPriorityFees / 2, METRIC.TRANSACTION_PRIORITY_FEES)
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue: dailyRevenue,
  };
}

const adapter: Adapter = {
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2021-01-17',
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  protocolType: ProtocolType.CHAIN,
  methodology: {
    Fees: 'Transaction fees paid by users',
    Revenue: 'Burned fees: 50% of base fees, and before 2025-02-12 also 50% of priority fees',
    HoldersRevenue: 'Burned fees: 50% of base fees, and before 2025-02-12 also 50% of priority fees',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRANSACTION_BASE_FEES]: 'Transaction base fees paid by users (5000 lamports per signature, including precompile signatures)',
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
