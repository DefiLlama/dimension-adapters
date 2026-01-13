/*
  Fragmetric - Liquid Restaking Protocol on Solana
  
  Fragmetric offers liquid restaking tokens (LRTs) built on the FRAG-22 architecture:
  - fragSOL: Liquid restaking for SOL (staking via nSOL)
  - fragJTO: Liquid restaking for JTO
  - fragBTC: Liquid restaking for BTC assets (zBTC, cbBTC, wBTC)
  - FRAG²: Liquid restaking for FRAG token
  - fragSWTCH: Liquid restaking for SWTCH token
  
  Architecture:
  - Users deposit assets → receive LRT tokens (fragSOL, fragJTO, etc.)
  - Assets allocated to nSOL (LST) which stakes SOL
  - Fragmetric earns proportional share of nSOL staking rewards
  - Protocol captures fees in Fund accounts
  
  Methodology (based on Fragmetric contract code):
  1. Track protocol fees: Transfers TO Fund Treasury accounts or Program Revenue account
  2. Track supply-side revenue: User reward claims FROM Reward Token Reserve ATAs
  3. Total fees = protocol fees + user reward claims
  
  Key insights from contract analysis:
  - Protocol revenue goes to XEhpR3UauMkARQ8ztwaU9Kbv16jEpBbXs9ftELka9wj
  - Reward Token Reserve accounts are ATAs of Reward Reserve PDAs (seed: ["reward_reserve", receipt_token_mint])
  - Fragmetric uses a claim-based reward system where users actively claim from these ATAs
  
  Program ID: fragnAis7Bp6FTsMoa6YcH8UffhEw43Ph79qAiK3iF3
*/

import { Dependencies, FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { queryDuneSql } from '../../helpers/dune'

const FRAGMETRIC = {
  // Protocol revenue destinations
  PROGRAM_REVENUE: 'XEhpR3UauMkARQ8ztwaU9Kbv16jEpBbXs9ftELka9wj',
  FRAGSOL_FUND: '3TK9fNePM4qdKC4dwvDe8Bamv14prDqdVfuANxPeiryb',
  FRAGJTO_FUND: 'ETbNmGejjPc1dswSZTdLDe8eUBeWvWokYPcFNgzYX9jj',

  // Reward Token Reserve ATAs (actual token-holding accounts)
  REWARD_TOKEN_RESERVES: [
    'HRUZvKBSiH62NepNmbfiy87HoQ488Pdx4bzhBZp6jBbC', // SW1TCH rewards
    'HVBsQPboYJ8UUaLzKsLWH3UgBUwyRgjwqRbuDoDmbNmE', // FRAG rewards
    'HWdpqHAJ1U3hmFpqJg5tJVrjaCJ7PuzB6j1VQf5VDqgJ', // fragSOL rewards
    'Cpo8uj8s3BDT5ouibT4h9qMmxQEEN3di3Zvhp2g9DHFo', // SW1TCH rewards (alt)
    '5MQGizjLpc6q9qrYX6NvN5PBkM5pJh3p8AxUYQ3Vm7iC', // FRAG rewards (alt)
    '9e6aRiMT9UxhwZHJdkGcUB74wRELStdvvzJzKZNEAzSE', // fragBTC rewards
    'Hdz9kJ982ydC5ZBBU4v5Uerno5urLrTsXmtULoTcgJdU', // fragJTO rewards
  ],
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const fundAccounts = [FRAGMETRIC.FRAGSOL_FUND, FRAGMETRIC.FRAGJTO_FUND]
  const programRevenue = FRAGMETRIC.PROGRAM_REVENUE
  const rewardTokenReserves = FRAGMETRIC.REWARD_TOKEN_RESERVES

  const query = `
    WITH
    -- Protocol fees: Transfers TO Fund Treasury or Program Revenue account
    protocol_fees AS (
      SELECT
        token_mint_address AS mint,
        SUM(amount) AS amount
      FROM tokens_solana.transfers
      WHERE to_owner IN (${fundAccounts.map((a) => `'${a}'`).join(', ')}, '${programRevenue}')
        AND block_time >= from_unixtime(${options.startTimestamp})
        AND block_time < from_unixtime(${options.endTimestamp})
      GROUP BY token_mint_address
    ),
    
    -- User reward claims: Transfers FROM actual Reward Token Reserve ATAs
    reward_claims AS (
      SELECT
        token_mint_address AS mint,
        SUM(amount) AS amount
      FROM tokens_solana.transfers
      WHERE from_owner IN (${rewardTokenReserves.map((a) => `'${a}'`).join(', ')})
        AND block_time >= from_unixtime(${options.startTimestamp})
        AND block_time < from_unixtime(${options.endTimestamp})
      GROUP BY token_mint_address
    )
    
    SELECT 'protocol' AS source, mint, amount FROM protocol_fees WHERE amount > 0
    UNION ALL
    SELECT 'rewards' AS source, mint, amount FROM reward_claims WHERE amount > 0
  `

  const results: any[] = await queryDuneSql(options, query)

  for (const row of results) {
    const { source, mint, amount } = row

    if (source === 'protocol') {
      // Protocol fees captured in Fund Treasury
      dailyRevenue.add(mint, amount)
      dailyFees.add(mint, amount)
    } else if (source === 'rewards') {
      // User reward claims from Reward Reserve = supply side
      dailySupplySideRevenue.add(mint, amount)
      dailyFees.add(mint, amount)
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Fees: 'Total fees generated from Fragmetric LRTs, including protocol revenue and user reward claims.',
  Revenue:
    "Protocol fees captured in Fund Treasury accounts and Program Revenue account. Represents Fragmetric's share of generated yield from restaking.",
  ProtocolRevenue: 'Same as Revenue - protocol fees captured by Fragmetric.',
  SupplySideRevenue:
    'Staking and restaking rewards claimed by LRT holders. Tracked via transfers from Reward Token Reserve accounts.',
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2024-08-01',
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology,
}

export default adapter
