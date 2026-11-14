import ADDRESSES from '../helpers/coreAssets.json'
import { Adapter, Dependencies, FetchOptions, ProtocolType } from "../adapters/types";
import { queryAllium } from "../helpers/allium";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
// import { queryDuneSql } from "../helpers/dune";

// SIMD-0096 (feature 3opE3EzAKnUftUDURkzMgwpNgimBAypW1mNDYH4x4Zg7) activated at this slot, the first of epoch 741,
// block time 2025-02-12 06:59:08 UTC: before it half of the priority fee was burned, from it the leader keeps all of it.
// The feature account stores the slot: getAccountInfo 3opE3EzAKnUftUDURkzMgwpNgimBAypW1mNDYH4x4Zg7 -> data 0x01 + u64 LE.
const SIMD_0096_ACTIVATION_SLOT = 320112000
const PRIORITY_FEES_REQUIRED_FROM = 1704067200 // 2024-01-01, from here priority fee txs land every few seconds, so missing or stale rows mean Allium lag
const BASE_FEES_TO_VALIDATORS = 'Transaction Base Fees To Validators'
const PRIORITY_FEES_TO_VALIDATORS = 'Transaction Priority Fees To Validators'

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
            SUM(CASE WHEN block_slot < ${SIMD_0096_ACTIVATION_SLOT} THEN priority_fee ELSE 0 END) AS pre_simd_0096_priority_fees,
            MAX(block_timestamp) AS fees_max_ts
        FROM solana.raw.fees
        WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
    )
    SELECT
        total_fees,
        total_priority_fees,
        pre_simd_0096_priority_fees,
        DATEDIFF('second', fees_max_ts, txs_max_ts) AS fees_lag_seconds
    FROM txs CROSS JOIN priority
  `;

  const res = await queryAllium(alliumFeequery);
  const row = res[0]
  if (!row || row.total_fees == null) throw new Error('Missing Solana transaction fees')
  const totalFees = Number(row.total_fees)
  if (options.startTimestamp >= PRIORITY_FEES_REQUIRED_FROM) {
    if (row.total_priority_fees == null) throw new Error('Missing Solana priority fees')
    const feesLagSeconds = Number(row.fees_lag_seconds)
    if (feesLagSeconds < 0) throw new Error('solana.raw.fees is ahead of solana.raw.transactions')
    if (feesLagSeconds > 600) throw new Error('solana.raw.fees is lagging solana.raw.transactions')
  }
  const totalPriorityFees = row.total_priority_fees == null ? 0 : Number(row.total_priority_fees)
  const preSimd0096PriorityFees = row.pre_simd_0096_priority_fees == null ? 0 : Number(row.pre_simd_0096_priority_fees)
  if (!Number.isFinite(totalFees) || !Number.isFinite(totalPriorityFees) || totalPriorityFees < 0 || totalPriorityFees > totalFees) {
    throw new Error('Invalid Solana priority fees')
  }
  if (!Number.isFinite(preSimd0096PriorityFees) || preSimd0096PriorityFees < 0 || preSimd0096PriorityFees > totalPriorityFees) {
    throw new Error('Invalid Solana pre SIMD-0096 priority fees')
  }
  const totalBaseFees = totalFees - totalPriorityFees

  // Base fee is 50/50 burn and leader (https://docs.anza.xyz/implemented-proposals/transaction-fees).
  // Priority fees were 50/50 too until SIMD-0096; from its activation slot the leader keeps all of them
  // (https://github.com/solana-foundation/solana-improvement-documents/blob/main/proposals/0096-reward-full-priority-fee-to-validator.md).
  // The split is by slot inside the query, so the window holding the activation (2025-02-12) is not booked
  // wholly on one side. Validator amounts are the residual of the same division, so fees = burn + validator share.
  const burnedBaseFees = totalBaseFees / 2
  const burnedPriorityFees = preSimd0096PriorityFees / 2
  const baseFeesToValidators = totalBaseFees - burnedBaseFees
  const priorityFeesToValidators = totalPriorityFees - burnedPriorityFees

  const dailySupplySideRevenue = options.createBalances()

  dailyFees.add(ADDRESSES.solana.SOL, totalBaseFees, METRIC.TRANSACTION_BASE_FEES)
  dailyFees.add(ADDRESSES.solana.SOL, totalPriorityFees, METRIC.TRANSACTION_PRIORITY_FEES)

  dailyRevenue.add(ADDRESSES.solana.SOL, burnedBaseFees, METRIC.TRANSACTION_BASE_FEES)
  dailyRevenue.add(ADDRESSES.solana.SOL, burnedPriorityFees, METRIC.TRANSACTION_PRIORITY_FEES)

  dailySupplySideRevenue.add(ADDRESSES.solana.SOL, baseFeesToValidators, BASE_FEES_TO_VALIDATORS)
  dailySupplySideRevenue.add(ADDRESSES.solana.SOL, priorityFeesToValidators, PRIORITY_FEES_TO_VALIDATORS)

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue: dailyRevenue.clone(),
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
    Revenue: 'Burned fees: 50% of base fees, and 50% of priority fees until SIMD-0096 (slot 320,112,000, 2025-02-12 06:59 UTC)',
    HoldersRevenue: 'Burned fees: 50% of base fees, and 50% of priority fees until SIMD-0096 (slot 320,112,000, 2025-02-12 06:59 UTC)',
    SupplySideRevenue: 'Transaction fees paid to the leader validator: half of the base fee, half of the priority fee until SIMD-0096 (slot 320,112,000, 2025-02-12 06:59 UTC), and the whole priority fee since then.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRANSACTION_BASE_FEES]: 'Transaction base fees paid by users (5000 lamports per signature, including precompile signatures)',
      [METRIC.TRANSACTION_PRIORITY_FEES]: 'Transaction priority fees paid by users',
    },
    Revenue: {
      [METRIC.TRANSACTION_BASE_FEES]: '50% transaction base fees will be burned',
      [METRIC.TRANSACTION_PRIORITY_FEES]: 'Until SIMD-0096 (slot 320,112,000, 2025-02-12 06:59 UTC), 50% priority fees will be burned',
    },
    HoldersRevenue: {
      [METRIC.TRANSACTION_BASE_FEES]: '50% transaction base fees will be burned',
      [METRIC.TRANSACTION_PRIORITY_FEES]: 'Until SIMD-0096 (slot 320,112,000, 2025-02-12 06:59 UTC), 50% priority fees will be burned',
    },
    SupplySideRevenue: {
      [BASE_FEES_TO_VALIDATORS]: 'Half of the base fee, paid to the leader validator.',
      [PRIORITY_FEES_TO_VALIDATORS]: 'Priority fees paid to the leader validator: half until SIMD-0096 (slot 320,112,000, 2025-02-12 06:59 UTC), all of them since.',
    },
  }
}

export default adapter;
