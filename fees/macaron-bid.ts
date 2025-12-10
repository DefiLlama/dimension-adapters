import { Dependencies, FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { queryDuneSql } from '../helpers/dune'

// Macaron protocol wallet addresses
// const STAKING_POOL_WALLET = '7jirHCE99LM5LKDknU9d3zxpXcxGLEXrh7AkwX9AGqtY'
const DEV_PLATFORM_WALLET = 'FeeRmkRwtAhsoNkKgHHYAp5RL2gC9pfdXp7WCEvVFAZC'

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
   // Query SOL received by staking pool (13%) and dev wallet (2%)
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
   
   const devAmount = res[0].total_received || 0 // 2%

   // Calculate total auction fees from dev wallet (2%)
   const totalFees = devAmount / 0.02

   // Calculate all components based on total fees
   const dailyFeesValue = totalFees // 100%
   const supplySideRevenue = totalFees * 0.85 // 85% to previous miners

   // Protocol revenue breakdown
   const buybackAmount = totalFees * 0.1 // 10% buyback
   const actualStakingAmount = totalFees * 0.03 // 3% staking
   const totalProtocolRevenue = buybackAmount + actualStakingAmount + devAmount // 10% + 3% + 2% = 15%

   // Create balances
   const dailyFees = options.createBalances()
   const dailyRevenue = options.createBalances()
   const dailyProtocolRevenue = options.createBalances()
   const dailySupplySideRevenue = options.createBalances()
   const dailyHoldersRevenue = options.createBalances()

   // Add SOL amounts using Coingecko ID
   dailyFees.addCGToken('solana', dailyFeesValue)
   dailyRevenue.addCGToken('solana', totalProtocolRevenue)
   dailyProtocolRevenue.addCGToken('solana', buybackAmount + devAmount) // 10% + 2%
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
         '15% of total auction fees distributed to protocol: 10% for buyback and burn, 3% for staking pool, 2% for dev and platform maintenance.',
      ProtocolRevenue:
         '12% of auction fees: 10% for buyback/burn (routed through staking wallet) + 2% for dev and platform maintenance.',
      SupplySideRevenue:
         '85% of auction fees returned to previous position owner as compensation for losing their mining position.',
      HoldersRevenue:
         '3% of auction fees allocated to staking pool for $MACARON token holders. Note: 13% total flows through staking wallet (10% buyback + 3% staking).'
   }
}

export default adapter
