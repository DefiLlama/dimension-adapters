import ADDRESSES from '../helpers/coreAssets.json'
import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { getSolanaReceived } from "../helpers/token";
import { METRIC } from '../helpers/metrics';
import { httpGet } from '../utils/fetchURL';

// Pump.fun bonding-curve fees, per https://pump.fun/docs/fees and the on-chain TradeEvent.
//
// Per-trade fee history (% of solAmount):
//   < 2025-05-13           pump 1.00% | creator 0.00%                     total 1.00%
//   2025-05-13 → ~2025-09  pump 0.95% | creator 0.05%                     total 1.00%
//   ~2025-09+              pump 0.95% | creator 0.30% (or cashback 0.30%) total 1.25%
//                          (Project Ascend; Cashback Coins from 2026-02-17 redirect the
//                          creator slot to traders/holders, mutually exclusive per coin.)
//
// Primary path reads pumpdotfun_solana.pump_evt_tradeevent (decoded). HoldersRevenue uses
// the buyback figure from fees.pump.fun/api/buybacks. Mayhem-mode trades zero out the fee
// columns on the event, so they're filtered out of the aggregation and captured via
// wallet inflows to GesfTA3X2arioaHp8bbKdjG9vJtskViWACZoYvxp4twS.
//
// Legacy fallbacks (fetchFromApi, fetchFromDune) approximate the protocol/holders split
// from an era policy ratio (getProtocolRevenueRatio) since they lack per-event detail.
//
// TODO: migration fees (6 SOL pre-2024-08-09, 1.5 SOL → ~2025-03, 0.015 SOL after).

const CREATOR_FEE_INTRO_TS = 1747094400  // 2025-05-13
const PROJECT_ASCEND_TS    = 1757894400  // 2025-09-15 (approx)
const BUYBACK_START_TS     = 1752451200  // 2025-07-14
const BURN_POLICY_TS       = 1777334400  // 2026-04-28: 50% of revenues locked for burn

// Fallback paths use this to extrapolate the creator slice from the pump slice.
function getCreatorFeeRatio(timestamp: number): number {
  if (timestamp < CREATOR_FEE_INTRO_TS) return 0
  if (timestamp < PROJECT_ASCEND_TS)    return 0.05 / 0.95
  return 0.30 / 0.95
}

// Fallback paths use this to split the pump slice into protocol vs holders revenue
// when the actual buyback amount isn't available.
function getProtocolRevenueRatio(timestamp: number): number {
  if (timestamp < BUYBACK_START_TS) return 1
  if (timestamp < BURN_POLICY_TS)   return 0
  return 0.5
}

// Mayhem-mode program fee wallet. Receives both native SOL and WSOL.
const MAYHEM_FEE_WALLET = 'GesfTA3X2arioaHp8bbKdjG9vJtskViWACZoYvxp4twS'

// LABELS used for the breakdown.
const LABEL = {
  PumpFunProtocolFee: 'Pump Fun Protocol Fees',
  PumpFunMayhemFee: 'Pump Fun Mayhem Fees',
  PumpFunCreatorFee: 'Pump Fun Creator Fees',
  PumpFunCashback: 'Pump Fun Cashback',
} as const

// Pump fee recipients (positive balance changes summed) and excluded fee-out wallets.
// https://dune.com/queries/4313339
const PUMP_FEE_RECIPIENTS = [
  'CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM',
  '62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV',
  'FWsW1xNtWscwNmKv6wVsU1iTzRN6wmmk3MjxRP5tT7hz',
  '7hTckgnGnLQR6sdH7YkqFTAA7VwTfYFaZ6EhEsU3saCX',
  'AVmoTthdrX6tKt4nDjco2D775W2YK3sDhxPcMmzUAmTY',
  '9rPYyANsfQZw3DnDmKE3YCQF5E8oD89UXoHn9JFEhJUz',
  'G5UZAVbAf46s7cKWoyKu8kYTip9DGTpbLZ2qa9Aq69dP',
  '7VtfL8fvgNfhz17qKRMjzQEXgbdpnHHHQRh54R9jP2RJ',
]
const PUMP_FEE_EXCLUDE_TX_ADDRESSES = [
  '49AdQfhKyVgWKb1HPi6maQxm5tqJasePR9K6Mn67hEYA',
  'EkuimaBYybHvviYjtMXcnC7eg6WQmzLriDPtvh98fjRg',
  'CL9jPThhYnxvPSWNLhR4J7in13WvtMXXBGCe8LEhipmj',
  '94qWNrtmfn42h3ZjUZwWvK1MEo9uVmmrBPd2hpNjYDjb',
  '7xQYoUjUJF1Kg6WVczoTAkaNhn5syQYcbvjmFrhjWpx',
  'BWXT6RUhit9FfJQM3pBmqeFLPYmuxgmyhMGC5sGr8RbA',
  'Bvtgim23rfocUzxVX9j9QFxTbBnH8JZxnaGLCEkXvjKS',
  'FGptqdxjahafaCzpZ1T6EDtCzYMv7Dyn5MgBLyB3VUFW',
  'X5QPJcpph4mBAJDzc4hRziFftSbcygV59kRb2Fu6Je1',
  '7GFUN3bWzJMKMRZ34JLsvcqdssDbXnp589SiE33KVwcC',
]

// Sum SOL inflows to the Mayhem fee wallet via Allium's solana.assets.transfers.
async function addMayhemFees(options: FetchOptions, dailyFees: any, dailyRevenue: any, dailyProtocolRevenue: any) {
  const mayhem = options.createBalances()
  await getSolanaReceived({ options, balances: mayhem, target: MAYHEM_FEE_WALLET })
  const labeled = mayhem.clone(1, LABEL.PumpFunMayhemFee)
  dailyFees.addBalances(labeled)
  dailyRevenue.addBalances(labeled)
  dailyProtocolRevenue.addBalances(labeled)
}

// Cached daily fee + buyback aggregates from fees.pump.fun.
let buybackData: any
async function getDailyApiData(dateString: string): Promise<{ pumpFeesUsd?: number; buybackUsd?: number } | undefined> {
  if (!buybackData)
    buybackData = httpGet('https://fees.pump.fun/api/buybacks').then(({ dailyBuybacks }) => {
      const dateMap: any = {}
      Object.entries(dailyBuybacks).forEach(([date, i]: any) => {
        date = date.split('T')[0]
        dateMap[date] = i
      })
      return dateMap
    })
  const dateMap = await buybackData
  return dateMap[dateString]
}

// Primary path: aggregate pump_fee / creator_fee / cashback from the decoded TradeEvent
// table; take buyback (HoldersRevenue) from the fees.pump.fun API.
async function fetchFromTradeEvents(options: FetchOptions) {
  const [rows, apiData] = await Promise.all([
    queryDuneSql(options, `
      SELECT
        SUM(fee)          / 1e9 AS pump_fee_sol,
        SUM(creator_fee)  / 1e9 AS creator_fee_sol,
        SUM(cashback)     / 1e9 AS cashback_sol,
        SUM(buyback_fee)  / 1e9 AS buyback_fee_sol,
        SUM(sol_amount)   / 1e9 AS sol_volume_sol
      FROM pumpdotfun_solana.pump_evt_tradeevent
      WHERE evt_block_time >= from_unixtime(${options.startTimestamp})
        AND evt_block_time <  from_unixtime(${options.endTimestamp})
        AND mayhem_mode = false
    `, { extraUIDKey: 'pump-trade-events' }),
    getDailyApiData(options.dateString).catch(() => undefined),
  ])

  const row = rows?.[0] ?? {}
  const pumpFeeLamports    = (row.pump_fee_sol    ?? 0) * 1e9
  const creatorFeeLamports = (row.creator_fee_sol ?? 0) * 1e9
  const cashbackLamports   = (row.cashback_sol    ?? 0) * 1e9
  const buybackUsd         = apiData?.buybackUsd  ?? 0

  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyHoldersRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  // Pump's slice: gross fees, also flows to revenue and (provisionally) protocol revenue.
  if (pumpFeeLamports > 0) {
    dailyFees.add(ADDRESSES.solana.SOL, pumpFeeLamports, LABEL.PumpFunProtocolFee)
    dailyRevenue.add(ADDRESSES.solana.SOL, pumpFeeLamports, LABEL.PumpFunProtocolFee)
    dailyProtocolRevenue.add(ADDRESSES.solana.SOL, pumpFeeLamports, LABEL.PumpFunProtocolFee)
  }

  // Creator slice: user-paid fee that flows out to coin creators (supply-side).
  if (creatorFeeLamports > 0) {
    dailyFees.add(ADDRESSES.solana.SOL, creatorFeeLamports, LABEL.PumpFunCreatorFee)
    dailySupplySideRevenue.add(ADDRESSES.solana.SOL, creatorFeeLamports, LABEL.PumpFunCreatorFee)
  }

  // Cashback Coins: user-paid fee redirected back to traders/holders of the coin
  // (supply-side; mutually exclusive with creator_fee on a per-coin basis).
  if (cashbackLamports > 0) {
    dailyFees.add(ADDRESSES.solana.SOL, cashbackLamports, LABEL.PumpFunCashback)
    dailySupplySideRevenue.add(ADDRESSES.solana.SOL, cashbackLamports, LABEL.PumpFunCashback)
  }

  // PUMP buyback from the fees.pump.fun API → HoldersRevenue. Subtract from protocol
  // revenue so HoldersRevenue + ProtocolRevenue ≈ Revenue for the pump slice.
  if (buybackUsd > 0) {
    dailyHoldersRevenue.addUSDValue(buybackUsd, METRIC.TOKEN_BUY_BACK)
    dailyProtocolRevenue.subtract(dailyHoldersRevenue)
  }

  // Mayhem-mode fees: tracked via wallet inflows (not in event fee columns).
  await addMayhemFees(options, dailyFees, dailyRevenue, dailyProtocolRevenue)

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  }
}

// Fallback: pump fees from fees.pump.fun, protocol/holders split via era ratio.
async function fetchFromApi(options: FetchOptions) {
  const { dateString, createBalances, startTimestamp } = options
  const apiData = await getDailyApiData(dateString)
  if (!apiData) throw new Error('No buyback data for date: ' + dateString)
  // The API also exposes `buybackUsd`, but that figure aggregates buybacks across pump.fun
  // bonding curve, PumpSwap, and Terminal — using it here would over-attribute non-bonding-
  // curve buybacks to this adapter. Split protocol/holders by the era policy instead.
  const { pumpFeesUsd = 0 } = apiData
  const creatorFeesUsd = pumpFeesUsd * getCreatorFeeRatio(startTimestamp)
  const protocolRatio = getProtocolRevenueRatio(startTimestamp)
  const pumpProtocolUsd = pumpFeesUsd * protocolRatio
  const pumpHoldersUsd  = pumpFeesUsd * (1 - protocolRatio)

  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const dailyHoldersRevenue = createBalances()
  const dailyProtocolRevenue = createBalances()
  const dailySupplySideRevenue = createBalances()

  // Pump's slice of the bonding-curve trade fee.
  dailyFees.addUSDValue(pumpFeesUsd, LABEL.PumpFunProtocolFee)
  dailyRevenue.addUSDValue(pumpFeesUsd, LABEL.PumpFunProtocolFee)
  if (pumpProtocolUsd > 0) dailyProtocolRevenue.addUSDValue(pumpProtocolUsd, LABEL.PumpFunProtocolFee)
  if (pumpHoldersUsd  > 0) dailyHoldersRevenue.addUSDValue(pumpHoldersUsd, METRIC.TOKEN_BUY_BACK)

  // Creator slice (extrapolated from pump fee using the era ratio). Supply-side; not revenue.
  if (creatorFeesUsd > 0) {
    dailyFees.addUSDValue(creatorFeesUsd, LABEL.PumpFunCreatorFee)
    dailySupplySideRevenue.addUSDValue(creatorFeesUsd, LABEL.PumpFunCreatorFee)
  }

  // Mayhem-mode fees: excluded from pump.fun's "Revenues" definition, so 100% protocol.
  await addMayhemFees(options, dailyFees, dailyRevenue, dailyProtocolRevenue)

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  }
}

// // Deeper fallback: pump fee wallet inflows from solana.account_activity, era-ratio split.
// async function fetchFromDune(options: FetchOptions) {
//   const dailyFees = options.createBalances()
//   const dailyRevenue = options.createBalances()
//   const dailyHoldersRevenue = options.createBalances()
//   const dailyProtocolRevenue = options.createBalances()
//   const dailySupplySideRevenue = options.createBalances()

//   // Pump's slice: positive balance_change at fee recipients, excluding fee-out tx ids.
//   // https://dune.com/queries/4313339
//   const pumpFeeRows = await queryDuneSql(options, `
//     WITH excluded_transactions AS (
//       SELECT DISTINCT tx_id
//       FROM solana.account_activity
//       WHERE tx_success = TRUE
//         AND block_time >= from_unixtime(${options.startTimestamp})
//         AND block_time <= from_unixtime(${options.endTimestamp})
//         AND address IN (${PUMP_FEE_EXCLUDE_TX_ADDRESSES.map(a => `'${a}'`).join(',')})
//         AND balance_change < 0
//     )
//     SELECT SUM(sa.balance_change) / 1e9 AS total_sol_revenue
//     FROM solana.account_activity sa
//     LEFT JOIN excluded_transactions et ON sa.tx_id = et.tx_id
//     WHERE sa.tx_success = TRUE
//       AND sa.block_time >= from_unixtime(${options.startTimestamp})
//       AND sa.block_time <= from_unixtime(${options.endTimestamp})
//       AND sa.address IN (${PUMP_FEE_RECIPIENTS.map(a => `'${a}'`).join(',')})
//       AND sa.balance_change > 0
//       AND et.tx_id IS NULL
//   `, { extraUIDKey: 'pump-fees' })

//   const pumpFeeLamports = (pumpFeeRows?.[0]?.total_sol_revenue ?? 0) * 1e9
//   const protocolRatio = getProtocolRevenueRatio(options.startTimestamp)
//   const pumpProtocolLamports = pumpFeeLamports * protocolRatio
//   const pumpHoldersLamports  = pumpFeeLamports * (1 - protocolRatio)

//   dailyFees.add(ADDRESSES.solana.SOL, pumpFeeLamports, LABEL.PumpFunProtocolFee)
//   dailyRevenue.add(ADDRESSES.solana.SOL, pumpFeeLamports, LABEL.PumpFunProtocolFee)
//   if (pumpProtocolLamports > 0) dailyProtocolRevenue.add(ADDRESSES.solana.SOL, pumpProtocolLamports, LABEL.PumpFunProtocolFee)
//   if (pumpHoldersLamports  > 0) dailyHoldersRevenue.add(ADDRESSES.solana.SOL, pumpHoldersLamports, METRIC.TOKEN_BUY_BACK)

//   // Creator slice extrapolated from the pump slice (era-aware ratio).
//   const creatorFeeRatio = getCreatorFeeRatio(options.startTimestamp)
//   if (creatorFeeRatio > 0) {
//     const creatorFeeLamports = pumpFeeLamports * creatorFeeRatio
//     dailyFees.add(ADDRESSES.solana.SOL, creatorFeeLamports, LABEL.PumpFunCreatorFee)
//     dailySupplySideRevenue.add(ADDRESSES.solana.SOL, creatorFeeLamports, LABEL.PumpFunCreatorFee)
//   }

//   // Mayhem-mode fees: excluded from pump.fun's "Revenues" definition, so 100% protocol.
//   await addMayhemFees(options, dailyFees, dailyRevenue, dailyProtocolRevenue)

//   return {
//     dailyFees,
//     dailyRevenue,
//     dailyProtocolRevenue,
//     dailyHoldersRevenue,
//     dailySupplySideRevenue,
//   }
// }

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
  return await fetchFromTradeEvents(options)
  // return await fetchFromDune(options)
}

const breakdownMethodology = {
  Fees: {
    [LABEL.PumpFunProtocolFee]: "Pump's slice of the bonding-curve trade fee (1% pre-2025-05-13, 0.95% after).",
    [LABEL.PumpFunCreatorFee]: 'Creator slice of the bonding-curve trade fee (0.05% from 2025-05-13, 0.30% from Project Ascend / Sept 2025).',
    [LABEL.PumpFunCashback]: 'Cashback Coins slice — paid by traders; same 0.30% slot as the creator fee, mutually exclusive per coin (Cashback Coins from Feb 2026).',
    [LABEL.PumpFunMayhemFee]: 'Mayhem-mode fees collected at the Mayhem program fee wallet.',
  },
  Revenue: {
    [LABEL.PumpFunProtocolFee]: "Pump's slice of the bonding-curve trade fee — kept by the protocol.",
    [LABEL.PumpFunMayhemFee]: 'Mayhem-mode fees (no creator/buyback split — 100% protocol).',
  },
  ProtocolRevenue: {
    [LABEL.PumpFunProtocolFee]: "Pump's slice net of the PUMP buyback portion.",
    [LABEL.PumpFunMayhemFee]: 'Mayhem-mode fees.',
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: 'PUMP token buyback (sourced from the fees.pump.fun API).',
  },
  SupplySideRevenue: {
    [LABEL.PumpFunCreatorFee]: 'Creator fees paid out to coin creators.',
    [LABEL.PumpFunCashback]: 'Cashback returned to traders/holders of the coin (Cashback Coins).',
  },
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2024-01-14',
  dependencies: [Dependencies.DUNE, Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  allowNegativeValue: true,
  breakdownMethodology,
  methodology: {
    Fees: "Bonding-curve trade fees paid by users (pump's slice + creator/cashback slice) plus Mayhem-mode fees.",
    Revenue: "Pump's slice of the bonding-curve trade fee plus Mayhem-mode fees.",
    ProtocolRevenue: "Revenue net of the PUMP token buyback. Mayhem fees have no buyback split.",
    HoldersRevenue: "PUMP token buyback (sourced from the fees.pump.fun API).",
    SupplySideRevenue: "Creator fees paid out to coin creators and cashback returned to traders/holders of the coin.",
  },
}

export default adapter
