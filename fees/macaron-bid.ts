import { Dependencies, FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { queryDuneSql } from '../helpers/dune'

// Macaron protocol wallet addresses
// const STAKING_POOL_WALLET = '7jirHCE99LM5LKDknU9d3zxpXcxGLEXrh7AkwX9AGqtY'
const DEV_PLATFORM_WALLET = 'FeeRmkRwtAhsoNkKgHHYAp5RL2gC9pfdXp7WCEvVFAZC'

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
   const timestamp = options.startOfDay
   const feeChangeDate = 1734433461 // Dec 17, 2025 10:44:21 UTC

   // Query SOL received by dev wallet (protocol fee)
   const query = `
    SELECT
      -- address,
      SUM(balance_change/1e9) AS total_received
    FROM solana.account_activity
    WHERE address = '${DEV_PLATFORM_WALLET}'
      AND balance_change > 0
      AND tx_success = true
      AND TIME_RANGE
    -- GROUP BY address
  `

   const res = await queryDuneSql(options, query)

   const devAmount = res[0].total_received || 0

   // Fee structure changes on Dec 17, 2025 10:44:21 UTC
   let totalFees,
      supplySideRevenue,
      buybackAmount,
      actualStakingAmount,
      liquidityAmount,
      totalProtocolRevenue

   if (timestamp < feeChangeDate) {
      // OLD fee structure: 85% sellers, 10% buyback, 3% staking, 2% dev
      totalFees = devAmount / 0.02 // 2% dev fee
      const dailyFeesValue = totalFees
      supplySideRevenue = totalFees * 0.85 // 85% to sellers
      buybackAmount = totalFees * 0.1 // 10% buyback & burn
      actualStakingAmount = totalFees * 0.03 // 3% staking
      liquidityAmount = 0 // No liquidity pool in old structure
      totalProtocolRevenue = buybackAmount + actualStakingAmount + devAmount // 10% + 3% + 2% = 15%
   } else {
      // NEW fee structure: 84% sellers, 10% buyback, 3% staking, 2% liquidity, 1% dev
      totalFees = devAmount / 0.01 // 1% dev fee
      const dailyFeesValue = totalFees
      supplySideRevenue = totalFees * 0.84 // 84% to sellers
      buybackAmount = totalFees * 0.1 // 10% buyback & burn
      actualStakingAmount = totalFees * 0.03 // 3% staking
      liquidityAmount = totalFees * 0.02 // 2% liquidity
      totalProtocolRevenue = buybackAmount + actualStakingAmount + liquidityAmount + devAmount // 10% + 3% + 2% + 1% = 16%
   }

   // Calculate daily fees value
   const dailyFeesValue = totalFees // 100%

   // Create balances
   const dailyFees = options.createBalances()
   const dailyRevenue = options.createBalances()
   const dailyProtocolRevenue = options.createBalances()
   const dailySupplySideRevenue = options.createBalances()
   const dailyHoldersRevenue = options.createBalances()

   // Add SOL amounts using Coingecko ID
   dailyFees.addCGToken('solana', dailyFeesValue)
   dailyRevenue.addCGToken('solana', totalProtocolRevenue)
   dailyProtocolRevenue.addCGToken('solana', buybackAmount + liquidityAmount + devAmount) // 10% + 2% + 1% = 13%
   dailySupplySideRevenue.addCGToken('solana', supplySideRevenue)
   dailyHoldersRevenue.addCGToken('solana', actualStakingAmount) // 3%

   return {
      dailyFees,
      dailyRevenue,
      dailyProtocolRevenue,
      dailySupplySideRevenue,
      dailyHoldersRevenue
   }
}

const adapter: SimpleAdapter = {
   version: 1,
   fetch,
   chains: [CHAIN.SOLANA],
   start: '2024-12-09',
   dependencies: [Dependencies.DUNE],
   isExpensiveAdapter: true,
   methodology: {
      Fees: 'Total auction fees collected when users seize mining positions. Uses Dutch auction mechanism where price doubles after each successful bid then decreases to 0 over 1 hour.',
      Revenue:
         'Protocol revenue distribution changed on Dec 17, 2025. OLD (before Dec 17): 15% total - 10% buyback/burn, 3% staking, 2% dev. NEW (after Dec 17): 16% total - 10% buyback/burn, 3% staking, 2% liquidity, 1% dev.',
      ProtocolRevenue:
         'OLD: 12% (10% buyback/burn + 2% dev). NEW: 13% (10% buyback/burn + 2% liquidity + 1% dev).',
      SupplySideRevenue:
         'Returned to previous position owner (seller) as compensation. OLD: 85%. NEW: 84%.',
      HoldersRevenue:
         '3% of auction fees allocated to staking pool for $MACARON token holders (unchanged).'
   }
}

export default adapter
