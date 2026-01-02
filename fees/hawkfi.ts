/*
  HawkFi - High Frequency Liquidity (HFL) platform on Solana
  https://hawkfi.ag | https://hawkfi.gitbook.io/whitepaper
  
  Fee Structure (per docs):
  - 0% deposit/withdrawal fee
  - 0% automation fee  
  - 8% performance fee on LP yield only (not on principal deposits)
  - 0.1% rebalance fee for balances < $1,000 (captured within claimfee flow)
  
  DEX Integrations:
  - Primary: Meteora DLMM (~95% of activity)
  - Secondary: Orca Whirlpool (~5% of activity)
  
  Limitation: This adapter only tracks Meteora DLMM fees using the indexed
  meteora_solana.lb_clmm_evt_claimfee table for query efficiency. Orca Whirlpool
  fees (~5%) are excluded to avoid expensive full-table scans on solana.instruction_calls.
  
  This adapter tracks the 8% performance fee sent to HawkFi's fee wallet
  during Meteora DLMM claimfee transactions, then derives total LP yield.
*/

import { Dependencies, FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { queryDuneSql } from '../helpers/dune'

const HAWKFI_PROGRAM = 'FqGg2Y1FNxMiGd51Q6UETixQWkF5fB92MysbYogRJb3P'
const FEE_WALLET = '4K3a2ucXiGvuMJMPNneRDyzmNp6i4RdzXJmBdWwGwPEh'

const fetch = async (options: FetchOptions) => {
  const dailyProtocolRevenue = options.createBalances()

  // Track 8% performance fee transfers to HawkFi fee wallet during Meteora claimfee txs
  const query = `
    WITH claimfee AS (
      SELECT evt_tx_id
      FROM meteora_solana.lb_clmm_evt_claimfee
      WHERE evt_outer_executing_account = '${HAWKFI_PROGRAM}'
        AND (feeX > 0 OR feeY > 0)
        AND evt_block_time >= from_unixtime(${options.startTimestamp})
        AND evt_block_time < from_unixtime(${options.endTimestamp})
    ),
    transfers AS (
      SELECT token_mint_address AS token, SUM(amount) AS amount
      FROM tokens_solana.transfers t
      JOIN claimfee c ON c.evt_tx_id = t.tx_id
      WHERE t.to_owner = '${FEE_WALLET}'
        AND t.block_time >= from_unixtime(${options.startTimestamp})
        AND t.block_time < from_unixtime(${options.endTimestamp})
      GROUP BY 1
    )
    SELECT token, amount FROM transfers
  `

  const rows: any[] = await queryDuneSql(options, query, { extraUIDKey: 'hawkfi-fees' })
  rows.forEach((row) => dailyProtocolRevenue.add(row.token, row.amount))

  // Total fees = protocol revenue / 0.08 (HawkFi takes 8% of LP yield)
  const dailyFees = dailyProtocolRevenue.clone(1 / 0.08)

  // Supply side revenue = 92% of total fees (what LPs keep)
  const dailySupplySideRevenue = dailyFees.clone(0.92)

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Fees: 'Total LP yield generated through HawkFi automated liquidity strategies on Meteora DLMM pools. Derived from the 8% performance fee collected (fee_amount / 0.08 = total_yield).',
  UserFees:
    'Total LP yield - users pay an 8% performance fee on yield earned, not on principal deposits.',
  Revenue: '8% performance fee on LP yield, collected by HawkFi protocol treasury.',
  ProtocolRevenue: '8% performance fee on LP yield, collected by HawkFi protocol treasury.',
  SupplySideRevenue:
    '92% of LP yield retained by liquidity providers after the HawkFi 8% performance fee.',
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: '2024-02-05',
    },
  },
  isExpensiveAdapter: true,
  dependencies: [Dependencies.DUNE],
  methodology,
}

export default adapter
