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
  - 100% of protocol fees used for FRAG token buybacks
  
  Methodology (based on Fragmetric contract code):
  1. Track protocol fees: Transfers TO Fund Treasury accounts or Program Revenue account
  2. Track supply-side revenue: User reward claims FROM Reward Token Reserve ATAs
  3. Track buybacks: FRAG tokens transferred TO Treasury Wallet (backed by 100% of protocol fees)
  4. Total fees = protocol fees + user reward claims
  
  Key insights from contract analysis:
  - Protocol revenue goes to XEhpR3UauMkARQ8ztwaU9Kbv16jEpBbXs9ftELka9wj
  - Reward Token Reserve accounts are ATAs of Reward Reserve PDAs (seed: ["reward_reserve", receipt_token_mint])
  - Fragmetric uses a claim-based reward system where users actively claim from these ATAs
  - Buybacks tracked via Treasury Wallet at 6dSWUQt6sbA6B26Jjzwa3JAQPXFVAQbzWY1X7xLqkRKD
  
  Program ID: fragnAis7Bp6FTsMoa6YcH8UffhEw43Ph79qAiK3iF3
*/

import { Dependencies, FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { queryDuneSql } from '../../helpers/dune'
import { METRIC } from '../../helpers/metrics'
import { getSolanaReceivedDune } from '../../helpers/token'

const FRAGMETRIC = {
  // Protocol revenue destinations
  PROGRAM_REVENUE: 'XEhpR3UauMkARQ8ztwaU9Kbv16jEpBbXs9ftELka9wj',
  FRAGSOL_FUND: '3TK9fNePM4qdKC4dwvDe8Bamv14prDqdVfuANxPeiryb',
  FRAGJTO_FUND: 'ETbNmGejjPc1dswSZTdLDe8eUBeWvWokYPcFNgzYX9jj',

  REWARD_TOKEN_RESERVES: [
    'HRUZvKBSiH62NepNmbfiy87HoQ488Pdx4bzhBZp6jBbC', // SW1TCH rewards
    'HVBsQPboYJ8UUaLzKsLWH3UgBUwyRgjwqRbuDoDmbNmE', // FRAG rewards
    'HWdpqHAJ1U3hmFpqJg5tJVrjaCJ7PuzB6j1VQf5VDqgJ', // fragSOL rewards
    'Cpo8uj8s3BDT5ouibT4h9qMmxQEEN3di3Zvhp2g9DHFo', // SW1TCH rewards (alt)
    '5MQGizjLpc6q9qrYX6NvN5PBkM5pJh3p8AxUYQ3Vm7iC', // FRAG rewards (alt)
    '9e6aRiMT9UxhwZHJdkGcUB74wRELStdvvzJzKZNEAzSE', // fragBTC rewards
    'Hdz9kJ982ydC5ZBBU4v5Uerno5urLrTsXmtULoTcgJdU', // fragJTO rewards
  ],

  // Buyback tracking
  TREASURY_WALLET: '6dSWUQt6sbA6B26Jjzwa3JAQPXFVAQbzWY1X7xLqkRKD',
  FRAG_TOKEN: 'FRAGMEWj2z65qM62zqKhNtwNFskdfKs4ekDUDX3b4VD5',

  SW1TCH: 'SW1TCHLmRGTfW5xZknqQdpdarB8PD95sJYWpNp9TbFx',
  FRAGSOL: 'FRAGSEthVFL7fdqM8hxfxkfCZzUvmg21cqPJVvC1qdbo',
  FRAGJTO: 'FRAGJ157KSDfGvBJtCSrsTWUqFnZhrw4aC8N8LqHuoos',
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const dailyHoldersRevenue = options.createBalances()

  const fundAccounts = [FRAGMETRIC.FRAGSOL_FUND, FRAGMETRIC.FRAGJTO_FUND]
  const programRevenue = FRAGMETRIC.PROGRAM_REVENUE
  const rewardTokenReserves = FRAGMETRIC.REWARD_TOKEN_RESERVES
  const query = `
    WITH
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
      if (mint === FRAGMETRIC.SW1TCH) {
        // Jito restaking vault yield
        dailyRevenue.add(mint, amount, METRIC.STAKING_REWARDS)
        dailyFees.add(mint, amount, METRIC.STAKING_REWARDS)
      } else if (mint === FRAGMETRIC.FRAGSOL || mint === FRAGMETRIC.FRAGJTO) {
        // LRT operation fees
        dailyRevenue.add(mint, amount, METRIC.MANAGEMENT_FEES)
        dailyFees.add(mint, amount, METRIC.MANAGEMENT_FEES)
      } else {
        // Other protocol fees
        dailyRevenue.add(mint, amount, METRIC.PROTOCOL_FEES)
        dailyFees.add(mint, amount, METRIC.PROTOCOL_FEES)
      }
    } else if (source === 'rewards') {
      if (mint === FRAGMETRIC.SW1TCH) {
        // Restaking rewards to users
        dailySupplySideRevenue.add(mint, amount, METRIC.STAKING_REWARDS)
        dailyFees.add(mint, amount, METRIC.STAKING_REWARDS)
      } else {
        // Other staking/yield rewards
        dailySupplySideRevenue.add(mint, amount, METRIC.ASSETS_YIELDS)
        dailyFees.add(mint, amount, METRIC.ASSETS_YIELDS)
      }
    }
  }

  // Track FRAG token buybacks using Solana helper
  await getSolanaReceivedDune({
    options,
    balances: dailyHoldersRevenue,
    target: FRAGMETRIC.TREASURY_WALLET,
  })

  // Apply buyback metric label to balances
  const balancesData = dailyHoldersRevenue.getBalances()
  for (const [tokenKey, amount] of Object.entries(balancesData)) {
    if (amount) {
      const token = tokenKey.includes(':') ? tokenKey.split(':')[1] : tokenKey

      dailyHoldersRevenue.removeTokenBalance(tokenKey) // Remove unlabelled balance
      dailyHoldersRevenue.add(token, amount, METRIC.TOKEN_BUY_BACK)
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
  }
}

const methodology = {
  Fees: 'Total fees generated from Fragmetric LRTs, including protocol revenue and user reward claims.',
  Revenue:
    "Protocol fees captured in Fund Treasury accounts, Program Revenue account, and Jito Restaking Vault. Includes fragSOL/fragJTO fees and protocol's share of Jito restaking rewards (SW1TCH).",
  ProtocolRevenue: 'Same as Revenue - protocol fees captured by Fragmetric.',
  SupplySideRevenue:
    'Staking and restaking rewards claimed by LRT holders. Tracked via transfers from Reward Token Reserve accounts.',
  HoldersRevenue:
    'FRAG token buybacks funded by 100% of protocol fees. Tracks FRAG tokens purchased and transferred to the Treasury Wallet, reducing circulating supply and benefiting token holders.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.MANAGEMENT_FEES]: 'Fees from fragSOL and fragJTO LRT operations',
    [METRIC.STAKING_REWARDS]: 'Restaking rewards from Jito vault operations',
    [METRIC.ASSETS_YIELDS]: 'Yield rewards distributed to LRT holders',
  },
  Revenue: {
    [METRIC.MANAGEMENT_FEES]: 'Protocol share of LRT operation fees',
    [METRIC.STAKING_REWARDS]: 'Protocol share of Jito restaking rewards',
  },
  SupplySideRevenue: {
    [METRIC.STAKING_REWARDS]: 'User claims of Jito restaking SW1TCH rewards',
    [METRIC.ASSETS_YIELDS]: 'User claims of other staking/yield rewards',
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: 'FRAG tokens purchased using protocol fees and sent to Treasury',
  },
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2024-07-15',
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology,
}

export default adapter
