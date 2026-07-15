import ADDRESSES from '../helpers/coreAssets.json'
import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { getSolanaReceived } from "../helpers/token";
import { METRIC } from '../helpers/metrics';
import { httpGet } from '../utils/fetchURL';
import { queryAllium } from '../helpers/allium';

// Pump.fun bonding-curve fees. Docs: https://pump.fun/docs/fees
//
// Per-trade fee history (% of trade size, paid by the trader):
//   < 2025-05-13               pump 1.00%  | creator 0.00%                       total 1.00%
//   2025-05-13 to 2025-09-15   pump 0.95%  | creator 0.05%                       total 1.00%
//   >= 2025-09-15              pump 0.95%  | creator 0.30%  OR  cashback 0.30%   total 1.25%
//     (Project Ascend introduced the 0.30% creator slice; Cashback Coins, from 2026-02-17,
//      redirect that same 0.30% slot back to traders/holders. Mutually exclusive per coin.)
//
// Data sources, in priority order:
//   * Primary  (>= 2025-11-05): decoded events in pumpdotfun_solana.pump_evt_tradeevent.
//                               Per-trade fee/creator/cashback splits are exact.
//   * Fallback (<  2025-11-05): wallet inflows from solana.account_activity (Dune
//                               query 4313339). Pump's slice only; creator slice is
//                               extrapolated via getCreatorFeeRatio.
//   * Buyback figure for HoldersRevenue: fees.pump.fun/api/buybacks (off-chain).
//
// Revenue split rationale:
//   * ProtocolRevenue is pump's slice * era ratio (getProtocolRevenueRatio). We don't
//     subtract the API buyback because that buyback aggregates across pump.fun + PumpSwap
//     + Terminal — subtracting it from this adapter alone would over-attribute.
//   * HoldersRevenue is the API buyback as-is. It won't sum exactly with ProtocolRevenue
//     to give Revenue, and that's intentional: child adapters don't report HoldersRevenue.
//
// Mayhem-mode trades zero out the fee columns on TradeEvent, so they're invisible to the
// primary query. We pick them up in both paths via SOL/WSOL inflows to the Mayhem program
// fee wallet (GesfTA3X2arioaHp8bbKdjG9vJtskViWACZoYvxp4twS) using getSolanaReceived.
//
// Validation (2025-07-14 → 2026-05-15, 305 days):
//   * Pre-cutoff wallet-inflow path matches fees.pump.fun pumpFeesSol to within +0.76%.
//   * Post-cutoff TradeEvent path matches pumpFeesSol to 0.00% on days the API gives a
//     clean per-product breakdown.
//   * From ~2026-04-20 the upstream API rolls PumpSwap into pumpFeesSol (sets
//     pumpAmmFeesSol = 0). Our adapter looks ~25% "low" vs the API on those days; that's
//     the API double-attributing, not an under-count here. csv_pumpdotfun + llama_pumpswap
//     reconciles to pumpFeesSol within ~7% across the bundling window.
//
// TODO: migration fees (6 SOL pre-2024-08-09, 1.5 SOL ~2025-03, 0.015 SOL after).

// Epoch boundaries (UTC midnight).
const CREATOR_FEE_INTRO_TS = 1747094400  // 2025-05-13: creator slice introduced (0.05%)
const PROJECT_ASCEND_TS    = 1757894400  // 2025-09-15: creator slice bumped to 0.30%
const BUYBACK_START_TS     = 1752451200  // 2025-07-14: PUMP buyback begins (100% of pump slice)
const BURN_POLICY_TS       = 1777334400  // 2026-04-28: buyback share drops to 50%
const TRADE_EVENT_START_TS = 1762300800  // 2025-11-05: pump_evt_tradeevent populated from here

// Creator fee as a fraction of pump's slice — used by the wallet-inflow fallback to
// reconstruct the creator portion when we only observe pump's wallet receipts.
function getCreatorFeeRatio(timestamp: number): number {
  if (timestamp < CREATOR_FEE_INTRO_TS) return 0
  if (timestamp < PROJECT_ASCEND_TS)    return 0.05 / 0.95
  return 0.30 / 0.95
}

// Fraction of pump's slice the protocol keeps (vs sending to the PUMP buyback).
// Era-based on purpose; see header comment for why we don't use the API buyback figure.
function getProtocolRevenueRatio(timestamp: number): number {
  if (timestamp < BUYBACK_START_TS) return 1     // pre-buyback: 100% protocol
  if (timestamp < BURN_POLICY_TS)   return 0     // 2025-07-14+: 100% to buyback
  return 0.5                                     // 2026-04-28+: 50/50 split
}

// Mayhem-mode program fee wallet (receives both native SOL and WSOL).
const MAYHEM_FEE_WALLET = 'GesfTA3X2arioaHp8bbKdjG9vJtskViWACZoYvxp4twS'
// Pump.fun migrator wallet: moves graduated bonding-curve liquidity to Raydium.
const PUMP_FUN_MIGRATOR = '39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg'

const LABEL = {
  PumpFunProtocolFee: 'Pump Fun Protocol Fees',
  PumpFunMayhemFee:   'Pump Fun Mayhem Fees',
  PumpFunCreatorFee:  'Pump Fun Creator Fees',
  PumpFunCashback:    'Pump Fun Cashback',
  PumpFunGraduationFee: 'Pump Fun Graduation Fees',
} as const

// Wallets used by the pre-cutoff fallback. https://dune.com/queries/4313339
// PUMP_FEE_RECIPIENTS: positive inflows here are counted as pump's slice.
// PUMP_FEE_EXCLUDE_TX_ADDRESSES: any tx that withdraws from one of these is dropped, to
//   filter out the fee-out movements (creator payouts, treasury sweeps, etc).
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

// Mayhem fees: SOL + WSOL inflows to the program fee wallet, counted as 100% protocol.
async function addMayhemFees(options: FetchOptions, dailyFees: any, dailyRevenue: any, dailyProtocolRevenue: any) {
  const mayhem = options.createBalances()
  await getSolanaReceived({ options, balances: mayhem, target: MAYHEM_FEE_WALLET })
  const labeled = mayhem.clone(1, LABEL.PumpFunMayhemFee)
  dailyFees.addBalances(labeled)
  dailyRevenue.addBalances(labeled)
  dailyProtocolRevenue.addBalances(labeled)
}

// fees.pump.fun/api/buybacks → daily PUMP buyback USD. Fetched once per process and
// indexed by date. Used only for HoldersRevenue; see header comment for why we don't
// subtract it from ProtocolRevenue.
// let buybackData: any
// async function getDailyApiData(dateString: string): Promise<{ buybackUsd?: number } | undefined> {
//   if (!buybackData)
//     buybackData = httpGet('https://fees.pump.fun/api/buybacks').then(({ dailyBuybacks }) => {
//       const dateMap: any = {}
//       Object.entries(dailyBuybacks).forEach(([date, i]: any) => {
//         date = date.split('T')[0]
//         dateMap[date] = i
//       })
//       return dateMap
//     })
//   const dateMap = await buybackData
//   return dateMap[dateString]
// }

const PUMP_TOKEN_MINT = 'pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn'
const PUMP_TOKEN_DECIMALS = 6;
const BURN_WALLETS = ['99mRw3EzdJZWEUjgp1nrU4WeHsukUBjbh7gYE7pm4F3c', '9jHrTCwpDANHLNQz5cem6XLUBM8KiTWKe766Br6KVCXM']

const fetchPumpBuybacksAllium = async (options: FetchOptions) => {
  const query = `
    SELECT
      COALESCE(SUM(raw_amount) / 1e${PUMP_TOKEN_DECIMALS}, 0) AS pump_burnt
    FROM solana.assets.transfers
    WHERE mint = '${PUMP_TOKEN_MINT}'
      AND from_address IN (${BURN_WALLETS.map(a => `'${a}'`).join(',')})
      AND type IN ('burn', 'burnChecked')
      AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      AND block_timestamp <  TO_TIMESTAMP_NTZ(${options.endTimestamp})
  `;
  const data = await queryAllium(query);
  return data[0].pump_burnt;
}

// Primary path (>= 2025-11-05): per-trade fee columns straight from the decoded event.
// Grouped by quote_mint so USDC-quoted pairs (introduced ~2026-05) are attributed in the
// correct token. quote_mint may be NULL on older rows / pre-IDL-update data → treat as SOL.
async function fetchFromTradeEvents(options: FetchOptions) {
  const [rows, pumpBurnt] = await Promise.all([
    queryDuneSql(options, `
      SELECT
        quote_mint,
        SUM(fee)         AS pump_fee,
        SUM(creator_fee) AS creator_fee,
        SUM(cashback)    AS cashback
      FROM pumpdotfun_solana.pump_evt_tradeevent
      WHERE evt_block_time >= from_unixtime(${options.startTimestamp})
        AND evt_block_time <  from_unixtime(${options.endTimestamp})
      GROUP BY quote_mint
    `, { extraUIDKey: 'pump-trade-events' }),
    fetchPumpBuybacksAllium(options),
  ])

  const feeRows: FeeRow[] = (rows ?? []).map((r: any) => ({
    mint:       normalizeQuoteMint(r.quote_mint),
    pumpFee:    +(r.pump_fee    ?? 0),
    creatorFee: +(r.creator_fee ?? 0),
    cashback:   +(r.cashback    ?? 0),
  }))

  return buildBalances(options, feeRows, pumpBurnt)
}

// Fallback path (< 2025-11-05): pump_evt_tradeevent isn't populated, so we read pump's
// slice from wallet inflows and reconstruct the creator slice with the era ratio.
// (Cashback didn't exist in this era, so we pass 0.)
// The Dune query scans only relevant wallet balance changes once, then splits fee-recipient
// inflows into normal bonding-curve fees and migrator-funded graduation fees. Txns with
// fee-recipient/internal outflows are excluded from the normal-fee bucket to avoid counting
// wallet-to-wallet movements as user-paid fees.
async function fetchFromDune(options: FetchOptions) {
  const feeRecipients = PUMP_FEE_RECIPIENTS.map(a => `'${a}'`).join(',')
  const excludeAddresses = [...PUMP_FEE_EXCLUDE_TX_ADDRESSES, ...PUMP_FEE_RECIPIENTS, PUMP_FUN_MIGRATOR].map(a => `'${a}'`).join(',')
  const relevantAddresses = [...new Set([...PUMP_FEE_EXCLUDE_TX_ADDRESSES, ...PUMP_FEE_RECIPIENTS, PUMP_FUN_MIGRATOR])].map(a => `'${a}'`).join(',')

  const [pumpFeeRows, pumpBurnt] = await Promise.all([
    queryDuneSql(options, `
      WITH fee_transactions AS (
        SELECT
          tx_id,
          SUM(CASE WHEN address IN (${feeRecipients}) AND balance_change > 0 THEN balance_change ELSE 0 END) AS fee_inflow,
          MAX(CASE WHEN address = '${PUMP_FUN_MIGRATOR}' AND balance_change < 0 THEN 1 ELSE 0 END) AS has_graduation,
          MAX(CASE WHEN address IN (${excludeAddresses}) AND balance_change < 0 THEN 1 ELSE 0 END) AS has_exclusion
        FROM solana.account_activity
        WHERE tx_success = TRUE
          AND TIME_RANGE
          AND address IN (${relevantAddresses})
        GROUP BY tx_id
      )
      SELECT
        SUM(CASE WHEN has_exclusion = 0 THEN fee_inflow ELSE 0 END) / 1e9 AS total_sol_revenue,
        SUM(CASE WHEN has_graduation = 1 THEN fee_inflow ELSE 0 END) / 1e9 AS graduation_sol_revenue
      FROM fee_transactions
      WHERE fee_inflow > 0
    `, { extraUIDKey: 'pump-fees' }),
    fetchPumpBuybacksAllium(options),
  ])

  const pumpFee       = (pumpFeeRows?.[0]?.total_sol_revenue ?? 0) * 1e9
  const graduationFee = (pumpFeeRows?.[0]?.graduation_sol_revenue ?? 0) * 1e9
  const creatorFee = pumpFee * getCreatorFeeRatio(options.startTimestamp)

  return buildBalances(
    options,
    [{ mint: ADDRESSES.solana.SOL, pumpFee, creatorFee, cashback: 0, graduationFee }],
    pumpBurnt,
  )
}

type FeeRow = { mint: string, pumpFee: number, creatorFee: number, cashback: number, graduationFee?: number }

// Pump's tradeevent reports the quote as the System Program id ('11...11') for SOL-quoted
// pairs (and may emit null/empty pre-IDL-update). Everything else (e.g. USDC mint) is the
// real SPL mint and passes through unchanged.
const SYSTEM_PROGRAM = '11111111111111111111111111111111'
function normalizeQuoteMint(mint: string | null | undefined): string {
  if (!mint || mint === SYSTEM_PROGRAM || mint === ADDRESSES.solana.SOL) return ADDRESSES.solana.SOL
  return mint
}

// Shared balance assembly. All three callers (TradeEvent path, Dune fallback, future
// callers) flow through here so the bucket mapping lives in one place.
//
// Mapping rules:
//   pump slice      → Fees + Revenue (always),
//                     ProtocolRevenue * era ratio, HoldersRevenue * (1 - era ratio in spirit)
//                     [we use API buyback for Holders instead — see header]
//   creator slice   → Fees + SupplySideRevenue (paid out to coin creators)
//   cashback slice  → Fees + SupplySideRevenue (paid back to traders/holders of the coin)
//   mayhem inflows  → Fees + Revenue + ProtocolRevenue (no splits)
async function buildBalances(
  options: FetchOptions,
  feeRows: FeeRow[],
  pumpBurnt: number,
) {
  const dailyFees             = options.createBalances()
  const dailyRevenue          = options.createBalances()
  const dailyProtocolRevenue  = options.createBalances()
  const dailyHoldersRevenue   = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const protocolRatio = getProtocolRevenueRatio(options.startTimestamp)
  for (const { mint, pumpFee, creatorFee, cashback, graduationFee = 0 } of feeRows) {
    // Pump's slice: gross fee, also revenue. ProtocolRevenue is the era-ratio share.
    if (pumpFee > 0) {
      dailyFees.add(mint, pumpFee, LABEL.PumpFunProtocolFee)
      dailyRevenue.add(mint, pumpFee, LABEL.PumpFunProtocolFee)
      const protocol = pumpFee * protocolRatio
      if (protocol > 0) dailyProtocolRevenue.add(mint, protocol, LABEL.PumpFunProtocolFee)
    }
    // Supply-side: creator and cashback slices.
    if (creatorFee > 0) {
      dailyFees.add(mint, creatorFee, LABEL.PumpFunCreatorFee)
      dailySupplySideRevenue.add(mint, creatorFee, LABEL.PumpFunCreatorFee)
    }
    if (cashback > 0) {
      dailyFees.add(mint, cashback, LABEL.PumpFunCashback)
      dailySupplySideRevenue.add(mint, cashback, LABEL.PumpFunCashback)
    }
    if (graduationFee > 0) {
      dailyFees.add(mint, graduationFee, LABEL.PumpFunGraduationFee)
      dailyRevenue.add(mint, graduationFee, LABEL.PumpFunGraduationFee)
      dailyProtocolRevenue.add(mint, graduationFee, LABEL.PumpFunGraduationFee)
    }
  }

  if (pumpBurnt > 0) dailyHoldersRevenue.addCGToken("pump-fun", pumpBurnt, METRIC.TOKEN_BUY_BACK)

  // Mayhem-mode fees (off-event; captured from wallet inflows). 100% protocol.
  await addMayhemFees(options, dailyFees, dailyRevenue, dailyProtocolRevenue)

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue }
}

// Route by date: pump_evt_tradeevent only exists from 2025-11-05; older days fall back
// to the wallet-inflow query.
const fetch: any = async (options: FetchOptions) => {
  return options.startOfDay < TRADE_EVENT_START_TS
    ? fetchFromDune(options)
    : fetchFromTradeEvents(options)
}

const breakdownMethodology = {
  Fees: {
    [LABEL.PumpFunProtocolFee]: "Pump's slice of the bonding-curve trade fee (1% pre-2025-05-13, 0.95% after).",
    [LABEL.PumpFunCreatorFee]: 'Creator slice of the bonding-curve trade fee (0.05% from 2025-05-13, 0.30% from Project Ascend / Sept 2025).',
    [LABEL.PumpFunCashback]: 'Cashback Coins slice — paid by traders; same 0.30% slot as the creator fee, mutually exclusive per coin (Cashback Coins from Feb 2026).',
    [LABEL.PumpFunMayhemFee]: 'Mayhem-mode fees collected at the Mayhem program fee wallet.',
    [LABEL.PumpFunGraduationFee]: 'Fees received by Pump.fun fee wallets from the token graduation during bonding-curve to Raydium migrations.',
  },
  Revenue: {
    [LABEL.PumpFunProtocolFee]: "Pump's slice of the bonding-curve trade fee — kept by the protocol.",
    [LABEL.PumpFunMayhemFee]: 'Mayhem-mode fees (no creator/buyback split — 100% protocol).',
    [LABEL.PumpFunGraduationFee]: 'Graduation fees kept by the protocol when tokens migrate from Pump.fun bonding curves to Raydium.',
  },
  ProtocolRevenue: {
    [LABEL.PumpFunProtocolFee]: "Pump's slice kept by the protocol after the buyback share (100% pre-2025-07-14, 0% from 2025-07-14, 50% from 2026-04-28).",
    [LABEL.PumpFunMayhemFee]: 'Mayhem-mode fees.',
    [LABEL.PumpFunGraduationFee]: 'Graduation fees kept by the protocol.',
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: 'PUMP token buyback (sourced from the fees.pump.fun API; aggregates buybacks across all pump products).',
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
    Fees: "Bonding-curve trade fees paid by users (pump's slice + creator/cashback slice), graduation fees, and Mayhem-mode fees.",
    Revenue: "Pump's slice of the bonding-curve trade fee plus graduation fees and Mayhem-mode fees.",
    ProtocolRevenue: "Pump's slice kept by the protocol after the buyback share, plus 100% of graduation and Mayhem fees. Era-based split: 100% pre-2025-07-14, 0% from 2025-07-14, 50% from 2026-04-28.",
    HoldersRevenue: "PUMP token buyback (sourced from the fees.pump.fun API; aggregates buybacks across all pump products, so it won't sum exactly with ProtocolRevenue here).",
    SupplySideRevenue: "Creator fees paid out to coin creators and cashback returned to traders/holders of the coin.",
  },
}

export default adapter
