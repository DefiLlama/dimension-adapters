import { Dependencies, FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { queryDuneSql } from '../../helpers/dune'

// Chopcorp program ID
const CHOPCORP_PROGRAM_ID = 'chopmfFa3T1CzZj9WUgq5e18aMvjufSHGfPTvyKkydL'

// Treasury PDA (receives buyback + lumberlode SOL)
const TREASURY_ADDRESS = 'AMkHU8Zfw53mVPjnn4rHmFTTF26sNFkUUQkuLA6f1s1d'

// Fee collector (receives admin fees)
const FEE_COLLECTOR_ADDRESS = '8MzVYN1ZFGRUuW5iz5Y183DYnqF7zFfhDTz4Qd4LC1w6'

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    // Query SOL received by fee_collector from Chopcorp program transactions only
    // Using subquery to filter by program ID (slower but accurate for multisig)
    const duneQuery = `
      with chopcorp_txns as (
        select distinct tx_id
          from solana.instruction_calls
          where executing_account = '${CHOPCORP_PROGRAM_ID}'
      and tx_success = true
      and TIME_RANGE
    ),
      fee_received as (
        select COALESCE(SUM(balance_change / 1e9), 0) as fee_received_sol
          from solana.account_activity
          where address = '${FEE_COLLECTOR_ADDRESS}'
      and balance_change > 0
      and tx_success = true
      and tx_id in (
        select tx_id
          from chopcorp_txns
      )
      and TIME_RANGE
    ),
      treasury_received as (
        select  COALESCE(SUM(balance_change / 1e9), 0) as treasury_received_sol
          from solana.account_activity
          where address = '${TREASURY_ADDRESS}'
      and balance_change > 0
      and tx_success = true
      and tx_id in (
        select tx_id
          from chopcorp_txns
      )
      and TIME_RANGE
    )
    select
      f.fee_received_sol,
      t.treasury_received_sol,
      (f.fee_received_sol + t.treasury_received_sol) as total_received_sol
      from fee_received f
        cross join treasury_received t;
  `
    // console.log(duneQuery)
    const queryResults = await queryDuneSql(options, duneQuery);

    if (!queryResults || queryResults.length !== 1)
        throw new Error("No results found")

    const feeCollectorAmount = queryResults[0].fee_received_sol;
    const treasuryAmount = queryResults[0].treasury_received_sol;

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
    const totalFees = miningTotalVolume + kothTotalVolume
    const totalSupplySide = miningSupplySide + kothSupplySide
    const totalLumberlode = miningLumberlode + kothLumberlode
    const totalBuyback = miningBuyback + kothBuyback
    const totalAdminFees = feeCollectorAmount
    const totalWatchdogRewards = kothWatchdog

    // Protocol Revenue = what protocol keeps (admin + lumberlode + buyback)
    const totalRevenue = totalAdminFees + totalLumberlode + totalBuyback + totalWatchdogRewards

    // Protocol keeps (excludes watchdog rewards to holders)
    const protocolKeeps = totalAdminFees

    // Create balances
    const dailyFees = options.createBalances()
    const dailyRevenue = options.createBalances()
    const dailyProtocolRevenue = options.createBalances()
    const dailySupplySideRevenue = options.createBalances()
    const dailyHoldersRevenue = options.createBalances()

    // dailyFees: Total fees from Mining and KOTH
    dailyFees.addCGToken('solana', totalFees)

    // dailyRevenue: Total protocol revenue (admin + lumberlode + buyback)
    dailyRevenue.addCGToken('solana', totalRevenue)

    // dailyProtocolRevenue: Protocol keeps (admin + buyback, excludes lumberlode which goes to stakers)
    dailyProtocolRevenue.addCGToken('solana', protocolKeeps)

    // dailySupplySideRevenue: Returned to winners/sellers
    dailySupplySideRevenue.addCGToken('solana', totalSupplySide)

    // dailyHoldersRevenue: Watchdog rewards + lumberlode (distributed to LOG stakers)
    dailyHoldersRevenue.addCGToken('solana', totalWatchdogRewards + totalLumberlode + totalBuyback)

    return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue,
        dailySupplySideRevenue,
        dailyHoldersRevenue
    }
}

const methodology = {
    Fees: 'Total fees from Mining and KOTH. MINING: 12% total (1% admin + 1% lumberlode + 10% buyback). KOTH: 15% total (2% admin + 1% lumberlode + 10% buyback + 2% watchdog) and all the fees going to supplyside',
    Revenue: 'Combined protocol revenue from Mining and KOTH. All non-supply-side fees collected by treasury and fee_collector.',
    ProtocolRevenue: 'Protocol keeps (admin fees). MINING: 1%. KOTH: 2% admin fees.',
    SupplySideRevenue: 'Returned to participants. MINING: 88% to round winners. KOTH: 85% to previous seat owner.',
    HoldersRevenue: 'Rewards for LOG stakers. Lumberlode SOL (1% from Mining + 1% from KOTH) + Watchdog rewards (2% from KOTH) and 10% spent on buybacks from mining and koth each'
}

const adapter: SimpleAdapter = {
    version: 1,
    chains: [CHAIN.SOLANA],
    fetch,
    start: '2025-12-31',
    isExpensiveAdapter: true,
    dependencies: [Dependencies.DUNE],
    methodology,
}

export default adapter