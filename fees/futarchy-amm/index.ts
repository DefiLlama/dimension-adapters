/*
  Futarchy Protocol Fees
  
  Aggregates fees from two sources:
  1. Futarchy AMM - 0.5% fee on SpotSwap transactions
  2. Meteora DAMM Pools - ownership-weighted LP fees based on actual liquidity positions
  
  All fees are protocol revenue (100% to Futarchy).
*/

import { Dependencies, FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { getSqlFromFile, queryDuneSql } from '../../helpers/dune'

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances()

  const query = await getSqlFromFile('helpers/queries/futarchy.sql', {
    start: options.startTimestamp,
    end: options.endTimestamp,
  })

  const result = await queryDuneSql(options, query)
  
  result.forEach((row: any) => {
    const fees = row.total_fees_usd ?? 0
    dailyFees.addUSDValue(fees, row.source)
  })

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const methodology = {
  Fees: 'Total fees collected from Futarchy AMM swaps (0.5%) and ownership-weighted Meteora DAMM pool LP fees.',
  UserFees: 'Trading fees paid by users when swapping on Futarchy AMM or Meteora pools.',
  Revenue: 'All fees are protocol revenue - 100% of AMM fees and Meteora LP fees weighted by DAO liquidity ownership.',
  ProtocolRevenue: 'All fees are protocol revenue - 100% of AMM fees and Meteora LP fees weighted by DAO liquidity ownership.',
}

const breakdownMethodology = {
  Fees: {
    'meteora_damm': 'Ownership-weighted LP fees from Meteora DAMM pools based on actual DAO liquidity positions',
    'futarchy_amm': '0.5% fees from Futarchy AMM swaps',
  },
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2025-10-09',
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology
}

export default adapter
