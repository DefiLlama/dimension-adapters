import { Dependencies, FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { queryDuneSql } from '../helpers/dune'

// Macaron protocol wallet addresses
// const STAKING_POOL_WALLET = '7jirHCE99LM5LKDknU9d3zxpXcxGLEXrh7AkwX9AGqtY'
const DEV_PLATFORM_WALLET = 'FeeRmkRwtAhsoNkKgHHYAp5RL2gC9pfdXp7WCEvVFAZC'

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
   // Query SOL received by dev wallet (3% = 2% liquidity + 1% protocol)
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

   const devAmount = res[0].total_received || 0 // 3% (2% liquidity + 1% protocol)

   // Calculate total auction fees from dev wallet (3%)
   const totalFees = devAmount / 0.03

   // Calculate all components based on total fees
   const dailyFeesValue = totalFees // 100%
   const supplySideRevenue = totalFees * 0.84 // 84% to previous miners (sellers)

   // Protocol revenue breakdown
   const buybackAmount = totalFees * 0.1 // 10% buyback & burn
   const actualStakingAmount = totalFees * 0.03 // 3% stake
   const liquidityAmount = totalFees * 0.02 // 2% liquidity
   const totalProtocolRevenue = buybackAmount + actualStakingAmount + liquidityAmount + devAmount // 10% + 3% + 2% + 1% = 16%

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
         '16% of total auction fees distributed to protocol: 10% for buyback and burn, 3% for staking pool, 2% for liquidity, 1% for protocol fee.',
      ProtocolRevenue:
         '13% of auction fees: 10% for buyback/burn + 2% for liquidity + 1% for protocol fee.',
      SupplySideRevenue:
         '84% of auction fees returned to previous position owner (seller) as compensation for losing their mining position.',
      HoldersRevenue: '3% of auction fees allocated to staking pool for $MACARON token holders.'
   }
}

export default adapter
