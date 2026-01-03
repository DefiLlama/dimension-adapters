/*
  HawkFi - High Frequency Liquidity (HFL) platform on Solana
  https://hawkfi.ag | https://hawkfi.gitbook.io/whitepaper
  
  Fee Structure (per docs):
  - 0% deposit/withdrawal fee
  - 0% automation fee  
  - 8% performance fee on LP yield only (not on principal deposits)
  - 0.1% rebalance fee for balances < $1,000 (captured within claimfee flow)
  
  DEX Integrations:
  - Primary: Meteora DLMM
  - Secondary: Orca Whirlpool
  - Swaps via Jupiter, Raydium during rebalancing
  
  This adapter tracks all transfers to HawkFi's dedicated fee wallet, which
  receives the 8% performance fee from all DEX integrations. This approach is
  more efficient and comprehensive than tracking individual DEX events.
*/

import { Dependencies, FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { queryDuneSql } from '../helpers/dune'

const FEE_WALLET = '4K3a2ucXiGvuMJMPNneRDyzmNp6i4RdzXJmBdWwGwPEh'

const fetch = async (options: FetchOptions) => {
  const dailyProtocolRevenue = options.createBalances()

  // Track all transfers to HawkFi fee wallet (8% performance fee from all DEX sources)
  const query = `
    SELECT token_mint_address AS token, SUM(amount) AS amount
    FROM tokens_solana.transfers
    WHERE to_owner = '${FEE_WALLET}'
      AND block_time >= from_unixtime(${options.startTimestamp})
      AND block_time < from_unixtime(${options.endTimestamp})
    GROUP BY 1
  `

  const rows: any[] = await queryDuneSql(options, query, { extraUIDKey: 'hawkfi-fees' })
  rows.forEach((row) => dailyProtocolRevenue.add(row.token, row.amount))

  // Total fees = protocol revenue / 0.08 (HawkFi takes 8% of LP yield)
  const dailyFees = dailyProtocolRevenue.clone(1 / 0.08)

  // Supply side revenue = 92% of total fees (what LPs keep)
  const dailySupplySideRevenue = dailyFees.clone(0.92)

  return {
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Fees: 'Total LP yield generated through HawkFi automated liquidity strategies on Meteora DLMM and Orca Whirlpool. Derived from the 8% performance fee collected (fee_amount / 0.08 = total_yield).',
  Revenue: '8% performance fee on LP yield and rebalance fees, collected by HawkFi protocol treasury.',
  ProtocolRevenue: '8% performance fee on LP yield and rebalance fees, collected by HawkFi protocol treasury.',
  SupplySideRevenue: '92% of LP yield retained by liquidity providers after the HawkFi 8% performance fee.',
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
