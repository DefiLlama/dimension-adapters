import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { queryDuneSql } from '../../helpers/dune'

// Chopcorp program ID
const CHOPCORP_PROGRAM_ID = 'chopmfFa3T1CzZj9WUgq5e18aMvjufSHGfPTvyKkydL'

// Treasury PDA (receives buyback + lumberlode SOL)
const TREASURY_ADDRESS = 'AMkHU8Zfw53mVPjnn4rHmFTTF26sNFkUUQkuLA6f1s1d'

// Fee collector (receives admin fees)
const FEE_COLLECTOR_ADDRESS = '8MzVYN1ZFGRUuW5iz5Y183DYnqF7zFfhDTz4Qd4LC1w6'

const fetch = async (options: FetchOptions) => {
  // Query SOL received by fee_collector from Chopcorp program transactions only
  // Using subquery to filter by program ID (slower but accurate for multisig)
  const feeCollectorQuery = `
    SELECT
      SUM(balance_change/1e9) AS total_received
    FROM solana.account_activity
    WHERE address = '${FEE_COLLECTOR_ADDRESS}'
      AND balance_change > 0
      AND tx_success = true
      AND tx_id IN (
        SELECT DISTINCT tx_id
        FROM solana.instruction_calls
        WHERE executing_account = '${CHOPCORP_PROGRAM_ID}'
          AND tx_success = true
          AND TIME_RANGE
      )
      AND TIME_RANGE
  `

  // Note: balance_change is net per-tx. During rare lumberlode hits (1/750 chance),
  // treasury may send > receive, causing negative balance_change and undercount.
  // This is acceptable as lumberlode payouts redistribute previously-collected fees.
  const treasuryQuery = `
    SELECT
      SUM(balance_change/1e9) AS total_received
    FROM solana.account_activity
    WHERE address = '${TREASURY_ADDRESS}'
      AND balance_change > 0
      AND tx_success = true
      AND tx_id IN (
        SELECT DISTINCT tx_id
        FROM solana.instruction_calls
        WHERE executing_account = '${CHOPCORP_PROGRAM_ID}'
          AND tx_success = true
          AND TIME_RANGE
      )
      AND TIME_RANGE
  `

  const [feeCollectorRes, treasuryRes] = await Promise.all([
    queryDuneSql(options, feeCollectorQuery),
    queryDuneSql(options, treasuryQuery)
  ])

  const feeCollectorAmount = feeCollectorRes[0]?.total_received || 0
  const treasuryAmount = treasuryRes[0]?.total_received || 0

  // ===== FEE STRUCTURE =====
  // Mining (Reset): 1% admin + 1% lumberlode + 10% buyback = 12% fees, 88% to winners
  // KOTH (Seize): 2% admin + 1% lumberlode + 10% buyback + 2% watchdog = 15% fees, 85% to prev owner
  // Prediction: 1% admin + 1% lumberlode + 1% buyback = 3% rake, 97% to winners

  // Estimate activity mix from admin fee ratio
  // Mining: 1% admin, 11% treasury (ratio 1:11)
  // KOTH: 2% admin, 11% treasury (ratio 2:11)
  // If treasury/feeCollector ≈ 11, likely mining dominant
  // If treasury/feeCollector ≈ 5.5, likely KOTH dominant
  
  const ratio = treasuryAmount / (feeCollectorAmount || 1)
  
  // Estimate mining vs KOTH split (prediction is typically small)
  // Mining ratio = 11, KOTH ratio = 5.5
  // Use weighted average to estimate split
  const miningWeight = Math.max(0, Math.min(1, (ratio - 5.5) / (11 - 5.5)))
  const kothWeight = 1 - miningWeight

  // ===== MINING FEES =====
  // fee_collector gets 1% → total mining volume = fee_collector_mining / 0.01
  const miningAdminFees = feeCollectorAmount * miningWeight
  const miningTotalVolume = miningAdminFees / 0.01
  const miningTotalFees = miningTotalVolume * 0.12 // 12% total fees
  const miningLumberlode = miningTotalVolume * 0.01
  const miningBuyback = miningTotalVolume * 0.10
  const miningSupplySide = miningTotalVolume * 0.88 // 88% to winners

  // ===== KOTH FEES =====
  // fee_collector gets 2% → total KOTH volume = fee_collector_koth / 0.02
  const kothAdminFees = feeCollectorAmount * kothWeight
  const kothTotalVolume = kothAdminFees / 0.02
  const kothTotalFees = kothTotalVolume * 0.15 // 15% total fees
  const kothLumberlode = kothTotalVolume * 0.01
  const kothBuyback = kothTotalVolume * 0.10
  const kothWatchdog = kothTotalVolume * 0.02 // 2% to watchdog (holder rewards)
  const kothSupplySide = kothTotalVolume * 0.85 // 85% to previous owner

  // ===== COMBINED TOTALS =====
  const totalFees = miningTotalFees + kothTotalFees
  const totalSupplySide = miningSupplySide + kothSupplySide
  const totalLumberlode = miningLumberlode + kothLumberlode
  const totalBuyback = miningBuyback + kothBuyback
  const totalAdminFees = feeCollectorAmount
  const totalWatchdogRewards = kothWatchdog

  // Protocol Revenue = what protocol keeps (admin + lumberlode + buyback)
  const totalProtocolRevenue = totalAdminFees + totalLumberlode + totalBuyback
  
  // Protocol keeps (excludes watchdog rewards to holders)
  const protocolKeeps = totalAdminFees + totalBuyback

  // Create balances
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const dailyHoldersRevenue = options.createBalances()

  // dailyFees: Total fees from Mining and KOTH
  dailyFees.addCGToken('solana', totalFees)

  // dailyRevenue: Total protocol revenue (admin + lumberlode + buyback)
  dailyRevenue.addCGToken('solana', totalProtocolRevenue)

  // dailyProtocolRevenue: Protocol keeps (admin + buyback, excludes lumberlode which goes to stakers)
  dailyProtocolRevenue.addCGToken('solana', protocolKeeps)

  // dailySupplySideRevenue: Returned to winners/sellers
  dailySupplySideRevenue.addCGToken('solana', totalSupplySide)

  // dailyHoldersRevenue: Watchdog rewards + lumberlode (distributed to LOG stakers)
  dailyHoldersRevenue.addCGToken('solana', totalWatchdogRewards + totalLumberlode)

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: '2025-12-31',
    }
  },
  isExpensiveAdapter: true,
  methodology: {
    Fees: 'Total fees from Mining and KOTH. MINING: 12% total (1% admin + 1% lumberlode + 10% buyback). KOTH: 15% total (2% admin + 1% lumberlode + 10% buyback + 2% watchdog).',
    Revenue: 'Combined protocol revenue from Mining and KOTH. All non-supply-side fees collected by treasury and fee_collector.',
    ProtocolRevenue: 'Protocol keeps (admin fees + buyback). MINING: 11% (1% admin + 10% buyback). KOTH: 12% (2% admin + 10% buyback).',
    SupplySideRevenue: 'Returned to participants. MINING: 88% to round winners. KOTH: 85% to previous seat owner.',
    HoldersRevenue: 'Rewards for LOG stakers. Lumberlode SOL (1% from Mining + 1% from KOTH) + Watchdog rewards (2% from KOTH).'
  }
}

export default adapter
