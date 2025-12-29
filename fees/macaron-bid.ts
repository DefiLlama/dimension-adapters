import { Dependencies, FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { queryDuneSql } from '../helpers/dune'

// Macaron protocol wallet addresses
const DEV_PLATFORM_WALLET = 'FeeRmkRwtAhsoNkKgHHYAp5RL2gC9pfdXp7WCEvVFAZC'
const AUCTION_MINING_PROGRAM_ID = 'BidUuhFU1wyjgmpTv4YMQrqzersavZLJRnsgpw3i4k88'
const BLOCK_MINING_PROGRAM_ID = 'BLockwMhb4Z5M3Xw1FdEobBpqTbER5akiyYKkMD4h7uj'

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
   const timestamp = options.startOfDay
   const feeChangeDate = 1734433461 // Dec 17, 2025 10:44:21 UTC
   const feeChangeDate2 = 1735308000 // Dec 27, 2025 14:00:00 UTC

   // Query SOL received by dev wallet from Auction-based Mining
   // Use subquery to filter tx_ids from auction program
   const auctionQuery = `
    SELECT
      SUM(balance_change/1e9) AS total_received
    FROM solana.account_activity
    WHERE address = '${DEV_PLATFORM_WALLET}'
      AND balance_change > 0
      AND tx_success = true
      AND tx_id IN (
        SELECT DISTINCT tx_id
        FROM solana.instruction_calls
        WHERE executing_account = '${AUCTION_MINING_PROGRAM_ID}'
          AND tx_success = true
          AND TIME_RANGE
      )
      AND TIME_RANGE
  `

   // Query SOL received by dev wallet from Block-based Mining (9% of total fees)
   const blockMiningQuery = `
    SELECT
      SUM(balance_change/1e9) AS total_received
    FROM solana.account_activity
    WHERE address = '${DEV_PLATFORM_WALLET}'
      AND balance_change > 0
      AND tx_success = true
      AND tx_id IN (
        SELECT DISTINCT tx_id
        FROM solana.instruction_calls
        WHERE executing_account = '${BLOCK_MINING_PROGRAM_ID}'
          AND tx_success = true
          AND TIME_RANGE
      )
      AND TIME_RANGE
  `

   const [auctionRes, blockMiningRes] = await Promise.all([
      queryDuneSql(options, auctionQuery),
      queryDuneSql(options, blockMiningQuery)
   ])

   const auctionDevAmount = auctionRes[0]?.total_received || 0
   const blockMiningDevAmount = blockMiningRes[0]?.total_received || 0

   // ===== AUCTION-BASED MINING FEES =====
   // Fee structure has 3 phases based on timestamp
   let auctionTotalFees,
      auctionSupplySideRevenue,
      auctionBuybackAmount,
      auctionStakingAmount,
      auctionLiquidityAmount,
      auctionProtocolRevenue

   if (timestamp < feeChangeDate) {
      // PHASE 1 (before Dec 17): 85% sellers, 10% buyback, 3% staking, 2% dev
      auctionTotalFees = auctionDevAmount / 0.02 // 2% dev fee
      auctionSupplySideRevenue = auctionTotalFees * 0.85 // 85% to sellers
      auctionBuybackAmount = auctionTotalFees * 0.1 // 10% buyback & burn
      auctionStakingAmount = auctionTotalFees * 0.03 // 3% staking
      auctionLiquidityAmount = 0 // No liquidity pool in old structure
      auctionProtocolRevenue = auctionBuybackAmount + auctionStakingAmount + auctionDevAmount // 10% + 3% + 2% = 15%
   } else if (timestamp < feeChangeDate2) {
      // PHASE 2 (Dec 17 - Dec 27): 84% sellers, 10% buyback, 3% staking, 2% liquidity, 1% dev
      auctionTotalFees = auctionDevAmount / 0.01 // 1% dev fee
      auctionSupplySideRevenue = auctionTotalFees * 0.84 // 84% to sellers
      auctionBuybackAmount = auctionTotalFees * 0.1 // 10% buyback & burn
      auctionStakingAmount = auctionTotalFees * 0.03 // 3% staking
      auctionLiquidityAmount = auctionTotalFees * 0.02 // 2% liquidity
      auctionProtocolRevenue =
         auctionBuybackAmount + auctionStakingAmount + auctionLiquidityAmount + auctionDevAmount // 10% + 3% + 2% + 1% = 16%
   } else {
      // PHASE 3 (after Dec 27): New fee structure - please specify the percentages
      auctionTotalFees = auctionDevAmount / 0.01 // TODO: Update dev fee percentage
      auctionSupplySideRevenue = auctionTotalFees * 0.84 // TODO: Update seller percentage
      auctionBuybackAmount = auctionTotalFees * 0.1 // TODO: Update buyback percentage
      auctionStakingAmount = auctionTotalFees * 0.03 // TODO: Update staking percentage
      auctionLiquidityAmount = auctionTotalFees * 0.02 // TODO: Update liquidity percentage
      auctionProtocolRevenue =
         auctionBuybackAmount + auctionStakingAmount + auctionLiquidityAmount + auctionDevAmount
   }

   // ===== BLOCK-BASED MINING FEES =====
   // Dev wallet receives 9% from Block-based Mining (8% buyback + 0.5% stake + 0.5% protocol fee)
   // Calculate total fees from the 9% received
   const blockMiningTotalFees = blockMiningDevAmount / 0.09

   // Apply percentages from diagram
   const blockMiningPlayersRevenue = blockMiningTotalFees * 0.88 // 88% to players
   const blockMiningMotherlodesAmount = blockMiningTotalFees * 0.03 // 3% to motherlodes (returned to users when explodes)
   const blockMiningSupplySideRevenue = blockMiningPlayersRevenue + blockMiningMotherlodesAmount // Total returned to users
   const blockMiningBuybackAmount = blockMiningTotalFees * 0.08 // 8% buyback & burn
   const blockMiningStakingAmount = blockMiningTotalFees * 0.005 // 0.5% staking
   const blockMiningProtocolFeeAmount = blockMiningTotalFees * 0.005 // 0.5% protocol fee
   const blockMiningLiquidityAmount = 0 // No liquidity in block-based mining

   const blockMiningProtocolRevenue =
      blockMiningBuybackAmount + blockMiningStakingAmount + blockMiningProtocolFeeAmount

   // ===== COMBINED TOTALS =====
   const totalFees = auctionTotalFees + blockMiningTotalFees
   const supplySideRevenue = auctionSupplySideRevenue + blockMiningSupplySideRevenue
   const buybackAmount = auctionBuybackAmount + blockMiningBuybackAmount
   const actualStakingAmount = auctionStakingAmount + blockMiningStakingAmount
   const liquidityAmount = auctionLiquidityAmount + blockMiningLiquidityAmount
   const totalProtocolRevenue = auctionProtocolRevenue + blockMiningProtocolRevenue
   const devAmount = auctionDevAmount + blockMiningDevAmount

   // Create balances
   const dailyFees = options.createBalances()
   const dailyRevenue = options.createBalances()
   const dailyProtocolRevenue = options.createBalances()
   const dailySupplySideRevenue = options.createBalances()
   const dailyHoldersRevenue = options.createBalances()

   // Add SOL amounts using Coingecko ID
   // dailyFees: Total fees from both Auction and Block mining
   dailyFees.addCGToken('solana', totalFees)

   // dailyRevenue: Total protocol revenue (all fees except supply side)
   dailyRevenue.addCGToken('solana', totalProtocolRevenue)

   // dailyProtocolRevenue: Protocol keeps (buyback, liquidity, dev) - excludes staking rewards for holders and motherlodes (returned to users)
   const protocolKeeps = buybackAmount + liquidityAmount + devAmount
   dailyProtocolRevenue.addCGToken('solana', protocolKeeps)

   // dailySupplySideRevenue: Returned to sellers/players
   dailySupplySideRevenue.addCGToken('solana', supplySideRevenue)

   // dailyHoldersRevenue: Staking rewards for token holders
   dailyHoldersRevenue.addCGToken('solana', actualStakingAmount)

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
      Fees: 'Total fees from both Auction-based Mining and Block-based Mining. Auction: Dutch auction mechanism where price doubles after each bid then decreases to 0 over 1 hour. Block: Players deploy SOL to mine blocks and earn tokens.',
      Revenue:
         'Combined protocol revenue from both mining types. AUCTION (after Dec 17, 2025): 16% total - 10% buyback/burn, 3% staking, 2% liquidity, 1% dev. BLOCK: 9% total - 8% buyback/burn, 0.5% staking, 0.5% protocol fee.',
      ProtocolRevenue:
         'Protocol keeps (excludes staking to holders and motherlodes). AUCTION: 13% (10% buyback/burn + 2% liquidity + 1% dev). BLOCK: 8.5% (8% buyback/burn + 0.5% protocol fee).',
      SupplySideRevenue:
         'Returned to participants. AUCTION: 84% to sellers (previous position owners). BLOCK: 91% to players (88% direct + 3% motherlodes when explode).',
      HoldersRevenue:
         'Staking rewards for $MACARON token holders. AUCTION: 3%. BLOCK: 0.5%. Combined from both mining mechanisms.'
   }
}

export default adapter
