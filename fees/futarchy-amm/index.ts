/*
  Futarchy Protocol Fees
  
  Aggregates fees from two sources:
  1. Futarchy AMM - 0.5% fee on SpotSwap transactions
  2. Meteora DAMM Pools - 0.4% LP fees from pools where Futarchy DAOs own 100% liquidity
  
  All fees are protocol revenue (100% to Futarchy).
*/

import { Dependencies, FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { getSqlFromFile, queryDuneSql } from '../../helpers/dune'

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()

  const ammSql = getSqlFromFile('helpers/queries/futarchy-amm.sql', {
    start: options.startTimestamp,
    end: options.endTimestamp,
  })

  const meteoraSql = getSqlFromFile('helpers/queries/futarchy-meteora.sql', {
    start: options.startTimestamp,
    end: options.endTimestamp,
  })

  const [ammResults, meteoraResults] = await Promise.all([
    queryDuneSql(options, ammSql, { extraUIDKey: 'amm' }),
    queryDuneSql(options, meteoraSql, { extraUIDKey: 'meteora' }),
  ])

  const ammFees = ammResults[0]?.total_fees_usd ?? 0
  const meteoraFees = meteoraResults[0]?.total_fees_usd ?? 0

  dailyFees.addUSDValue(ammFees)
  dailyFees.addUSDValue(meteoraFees)
  dailyRevenue.addUSDValue(ammFees)
  dailyRevenue.addUSDValue(meteoraFees)

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  }
}

const methodology = {
  Fees: 'Total fees collected from Futarchy AMM swaps (0.5%) and Meteora DAMM pool LP fees (0.4%).',
  UserFees: 'Trading fees paid by users when swapping on Futarchy AMM or Meteora pools.',
  Revenue: 'All fees are protocol revenue - 100% of AMM fees and 100% of Meteora LP fees (Futarchy DAOs own all liquidity).',
  ProtocolRevenue: 'All fees are protocol revenue - 100% of AMM fees and 100% of Meteora LP fees.',
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: '2025-10-09',
    },
  },
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology,
}

export default adapter
