import ADDRESSES from '../helpers/coreAssets.json'
import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { getSolanaReceived } from "../helpers/token";
import { METRIC } from '../helpers/metrics';
import { httpGet } from '../utils/fetchURL';

// ---------------------------------------------------------------------------
// Pump.fun bonding-curve fee evolution (per-trade % of solAmount).
// Source: https://pump.fun/docs/fees + on-chain TradeEvent.
//
//   < 2025-05-13            pump 1.00% | creator 0.00% | total 1.00%
//   2025-05-13 → ~2025-09   pump 0.95% | creator 0.05% | total 1.00%   (creator fee turned on)
//   ~2025-09 → present      pump 0.95% | creator 0.30% | total 1.25%   (Project Ascend / Dynamic Fees V1)
//
// Buyback (2025-07-14+): 50% of the pump fee buys back PUMP. Already tracked via wallet flows.
// Cashback Coins (2026-02-17+): a coin can opt to redirect the 0.30% creator slot to traders/
//   holders instead of the creator. Total user-paid fee unchanged;
//   add once pumpdotfun_solana.pump_evt_tradeevent exposes the cashback column.
//
// Migration fees (graduation, paid to pump fee wallets — TODO: add later):
//   < 2024-08-09            6 SOL retained from liquidity at graduation
//   2024-08-09 → ~2025-03   1.5 SOL (1 SOL protocol, 0.5 SOL creator graduation bonus)
//   ~2025-03 (PumpSwap)+    0.015 SOL (covers account creation only)
//
// Mayhem mode (separate program, fee wallet GesfTA3X2arioaHp8bbKdjG9vJtskViWACZoYvxp4twS):
// fees settle as native SOL or WSOL into this wallet. Tracked here via getSolanaReceived
// (Allium). The pump.fun buybacks API does not cover Mayhem, so Mayhem fees are 100%
// protocol revenue (no buyback split). Switch to the decoded TradeEvent table once Dune
// decodes that program too.
//
// Padre trading-bot fees: tracked separately by the trading-terminal adapter (which
// reuses the dead `padre` adapter's filtered SQL). Not aggregated here.
//
// SAMPLE QUERY — once Dune refreshes the pumpdotfun_solana IDL with the appended fields,
// replace the wallet-flow query with the decoded-event aggregation below. Cashback and
// buyback_fee columns are appended on the on-chain event (Anchor/Borsh is append-only) and
// will surface as new columns after the IDL refresh.
//
//   SELECT
//     SUM(bytearray_to_int256(reverse(sol_amount)))   AS sol_amount,
//     SUM(bytearray_to_int256(reverse(fee)))          AS pump_fee,
//     SUM(bytearray_to_int256(reverse(creator_fee)))  AS creator_fee,
//     SUM(bytearray_to_int256(reverse(cashback)))     AS cashback,        -- pending IDL refresh
//     SUM(bytearray_to_int256(reverse(buyback_fee)))  AS buyback_fee      -- pending IDL refresh
//   FROM pumpdotfun_solana.pump_evt_tradeevent
//   WHERE block_time >= from_unixtime(<startTimestamp>)
//     AND block_time <  from_unixtime(<endTimestamp>)
//
// Per-day sanity invariant: pump_fee + creator_fee + cashback ≈ 1.25% of sol_amount
// (1.00% pre-Project Ascend); buyback_fee ≈ 50% of pump_fee post-2025-07-14.
// ---------------------------------------------------------------------------

// Date thresholds (UTC midnight) for the creator-fee era.
const CREATOR_FEE_INTRO_TS = 1747094400  // 2025-05-13: creator fee turned on for bonding-curve coins
const PROJECT_ASCEND_TS    = 1757894400  // 2025-09-15 (approx): Dynamic Fees V1, creator slice grows to 0.30%
const BUYBACK_START_TS     = 1752451200  // 2025-07-14: pump fees → 50% buyback wallet from this point onwards

// Ratio of creator fee to pump fee at a given moment. Used to extrapolate creator fees from
// the wallet-tracked pump fees until pumpdotfun_solana.pump_evt_tradeevent exposes creator_fee.
function getCreatorFeeRatio(timestamp: number): number {
  if (timestamp < CREATOR_FEE_INTRO_TS) return 0
  if (timestamp < PROJECT_ASCEND_TS)    return 0.05 / 0.95   // ~0.0526 — small creator slice, pre-Ascend
  return 0.30 / 0.95                                          // ~0.3158 — Project Ascend onwards
}

// Mayhem-mode program fee wallet. Receives both native SOL and WSOL.
const MAYHEM_FEE_WALLET = 'GesfTA3X2arioaHp8bbKdjG9vJtskViWACZoYvxp4twS'

// LABELS used for the breakdown.
const LABEL = {
  PumpFunProtocolFee: 'Pump Fun Protocol Fees',
  PumpFunMayhemFee: 'Pump Fun Mayhem Fees',
  PumpFunCreatorFee: 'Pump Fun Creator Fees',
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

// PUMP buyback senders / excluded receivers (transfer-based buyback measurement).
const BUYBACK_FROM_OWNERS = [
  '3vkpy5YHqnqJTnA5doWTpcgKyZiYsaXYzYM9wm8s3WTi',
  '88uq8JNL6ANwmow1og7VQD4hte73Jpw8qsUP77BtF6iE',
  '3YNxfRAEqKrGNCmx5JUfCD9er5djZToqSomzR2Yi8rqx',
]
const BUYBACK_TO_OWNERS_EXCLUDE = [
  '6UJoY1CFEymoqMrnmBLeZoemBGiJcySNdR7Jyj2nF848',
  '88uq8JNL6ANwmow1og7VQD4hte73Jpw8qsUP77BtF6iE',
  '3YNxfRAEqKrGNCmx5JUfCD9er5djZToqSomzR2Yi8rqx',
]
const WSOL_MINTS = [
  'So11111111111111111111111111111111111111112',
  'So11111111111111111111111111111111111111111',
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

// ---------------------------------------------------------------------------
// API path: pump.fun publishes daily fee + buyback aggregates at fees.pump.fun.
// We use that as the primary source and fall back to Dune wallet flows on failure.
// ---------------------------------------------------------------------------
let buybackData: any
async function fetchFromApi(options: FetchOptions) {
  const { dateString, createBalances, startTimestamp } = options
  if (!buybackData)
    buybackData = httpGet('https://fees.pump.fun/api/buybacks').then(({ dailyBuybacks }) => {
      const dateMap: any = {}
      Object.entries(dailyBuybacks).forEach(([date, i]: any) => {
        date = date.split('T')[0]
        dateMap[date] = i
      })
      return dateMap
    })

  buybackData = await buybackData
  if (!buybackData[dateString]) throw new Error('No buyback data for date: ' + dateString)
  const { pumpFeesUsd, buybackUsd } = buybackData[dateString]
  const creatorFeesUsd = pumpFeesUsd * getCreatorFeeRatio(startTimestamp)

  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const dailyHoldersRevenue = createBalances()
  const dailyProtocolRevenue = createBalances()
  const dailySupplySideRevenue = createBalances()

  // Pump's slice of the bonding-curve trade fee.
  dailyFees.addUSDValue(pumpFeesUsd, LABEL.PumpFunProtocolFee)
  dailyRevenue.addUSDValue(pumpFeesUsd, LABEL.PumpFunProtocolFee)
  dailyProtocolRevenue.addUSDValue(pumpFeesUsd - buybackUsd, LABEL.PumpFunProtocolFee)

  // Creator slice (extrapolated from pump fee using the era ratio). Supply-side; not revenue.
  if (creatorFeesUsd > 0) {
    dailyFees.addUSDValue(creatorFeesUsd, LABEL.PumpFunCreatorFee)
    dailySupplySideRevenue.addUSDValue(creatorFeesUsd, LABEL.PumpFunCreatorFee)
  }

  // Mayhem-mode fees (no buyback split → 100% protocol revenue).
  await addMayhemFees(options, dailyFees, dailyRevenue, dailyProtocolRevenue)

  // PUMP token buyback (50% of the pump slice from 2025-07-14 onwards).
  dailyHoldersRevenue.addUSDValue(buybackUsd, METRIC.TOKEN_BUY_BACK)

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  }
}

// ---------------------------------------------------------------------------
// Dune fallback: wallet-flow queries used when the fees.pump.fun API is unavailable
// (or before the buyback existed). Will be replaced by the decoded TradeEvent query
// once the Dune IDL refresh exposes pump_fee / creator_fee / cashback columns.
// ---------------------------------------------------------------------------
async function fetchFromDune(options: FetchOptions) {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  // Pump's slice: positive balance_change at fee recipients, excluding fee-out tx ids.
  // https://dune.com/queries/4313339
  const pumpFeeRows = await queryDuneSql(options, `
    WITH excluded_transactions AS (
      SELECT DISTINCT tx_id
      FROM solana.account_activity
      WHERE tx_success = TRUE
        AND block_time >= from_unixtime(${options.startTimestamp})
        AND block_time <= from_unixtime(${options.endTimestamp})
        AND address IN (${PUMP_FEE_EXCLUDE_TX_ADDRESSES.map(a => `'${a}'`).join(',')})
        AND balance_change < 0
    )
    SELECT SUM(sa.balance_change) / 1e9 AS total_sol_revenue
    FROM solana.account_activity sa
    LEFT JOIN excluded_transactions et ON sa.tx_id = et.tx_id
    WHERE sa.tx_success = TRUE
      AND sa.block_time >= from_unixtime(${options.startTimestamp})
      AND sa.block_time <= from_unixtime(${options.endTimestamp})
      AND sa.address IN (${PUMP_FEE_RECIPIENTS.map(a => `'${a}'`).join(',')})
      AND sa.balance_change > 0
      AND et.tx_id IS NULL
  `, { extraUIDKey: 'pump-fees' })

  const pumpFeeLamports = (pumpFeeRows?.[0]?.total_sol_revenue ?? 0) * 1e9
  dailyFees.add(ADDRESSES.solana.SOL, pumpFeeLamports, LABEL.PumpFunProtocolFee)
  dailyRevenue.add(ADDRESSES.solana.SOL, pumpFeeLamports, LABEL.PumpFunProtocolFee)

  // Creator slice extrapolated from the pump slice (era-aware ratio).
  const creatorFeeRatio = getCreatorFeeRatio(options.startTimestamp)
  if (creatorFeeRatio > 0) {
    const creatorFeeLamports = pumpFeeLamports * creatorFeeRatio
    dailyFees.add(ADDRESSES.solana.SOL, creatorFeeLamports, LABEL.PumpFunCreatorFee)
    dailySupplySideRevenue.add(ADDRESSES.solana.SOL, creatorFeeLamports, LABEL.PumpFunCreatorFee)
  }

  // Mayhem-mode fees.
  await addMayhemFees(options, dailyFees, dailyRevenue, dailyProtocolRevenue)
  // dailyProtocolRevenue at this point only contains Mayhem; pump's net protocol revenue
  // is computed below by subtracting the buyback from dailyRevenue's pump slice.

  // Pre-buyback era: no PUMP buyback to split off, so pump slice is 100% protocol revenue.
  if (options.startTimestamp < BUYBACK_START_TS) {
    dailyProtocolRevenue.add(ADDRESSES.solana.SOL, pumpFeeLamports, LABEL.PumpFunProtocolFee)
    return {
      dailyFees,
      dailyRevenue,
      dailyProtocolRevenue,
      dailySupplySideRevenue,
    }
  }

  // PUMP buyback: WSOL transfers from the buyback wallets to non-self addresses.
  const buybackRows = await queryDuneSql(options, `
    SELECT SUM(amount_display) AS total_amount
    FROM tokens_solana.transfers
    WHERE block_time >= from_unixtime(${options.startTimestamp})
      AND block_time <= from_unixtime(${options.endTimestamp})
      AND from_owner IN (${BUYBACK_FROM_OWNERS.map(a => `'${a}'`).join(',')})
      AND to_owner NOT IN (${BUYBACK_TO_OWNERS_EXCLUDE.map(a => `'${a}'`).join(',')})
      AND token_mint_address IN (${WSOL_MINTS.map(m => `'${m}'`).join(',')})
  `, { extraUIDKey: 'pump-burn' })
  const buybackLamports = (buybackRows[0].total_amount || 0) * 1e9

  const dailyHoldersRevenue = options.createBalances()
  dailyHoldersRevenue.add(ADDRESSES.solana.SOL, buybackLamports, METRIC.TOKEN_BUY_BACK)

  // Pump slice net of the buyback → protocol revenue (Mayhem already added above).
  dailyProtocolRevenue.add(ADDRESSES.solana.SOL, pumpFeeLamports - buybackLamports, LABEL.PumpFunProtocolFee)

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  }
}

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
  if (options.startTimestamp >= BUYBACK_START_TS) {
    try {
      return await fetchFromApi(options)
    } catch (e) {
      console.log('Error fetching from API, falling back to Dune', e)
    }
  }
  return await fetchFromDune(options)
}

const breakdownMethodology = {
  Fees: {
    [LABEL.PumpFunProtocolFee]: "Pump's slice of the bonding-curve trade fee (1% pre-2025-05-13, 0.95% after).",
    [LABEL.PumpFunCreatorFee]: 'Creator slice of the bonding-curve trade fee (0.05% from 2025-05-13, 0.30% from Project Ascend / Sept 2025).',
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
    [METRIC.TOKEN_BUY_BACK]: 'PUMP token buyback (50% of the pump slice from 2025-07-14 onwards).',
  },
  SupplySideRevenue: {
    [LABEL.PumpFunCreatorFee]: 'Creator fees paid out to coin creators.',
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
    Fees: "Bonding-curve trade fees paid by users (pump's slice + creator slice) plus Mayhem-mode fees.",
    Revenue: "Pump's slice of the bonding-curve trade fee plus Mayhem-mode fees.",
    ProtocolRevenue: "Revenue net of the PUMP token buyback. Mayhem fees have no buyback split.",
    HoldersRevenue: "PUMP token buybacks (50% of pump's bonding-curve slice since 2025-07-14).",
    SupplySideRevenue: "Creator fees paid out to coin creators.",
  },
}

export default adapter
