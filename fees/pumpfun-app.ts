import ADDRESSES from '../helpers/coreAssets.json'
import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

// Pump.fun app (interface listing). Trades placed through the official pump.fun
// mobile app invoke the app program below in the same transaction (the web app builds
// direct program instructions and never touches it); fees are the pump.fun
// bonding-curve + PumpSwap trade fees on those trades, doublecounted with the parent
// pumpdotfun / pump-swap listings. Mayhem-mode trades zero their fee columns and are
// not counted; the PUMP buyback (holders revenue) stays in the parent adapter only.
const APP_PROGRAM = '6Vo3245eszAb5wuqEMw8mGdbfRUdKbHhDHP5LcaGuTAB'

// Platform Fee (https://pump.fun/docs/fees): 0.45% of web/mobile app trades (0.40% with a
// referral code), paid in SOL or USDC to this wallet since 2026-10-16 (first fee tx
// 2zHNmxmLAesNqGUkvPZgHidagwxDvKeP4KYR1j9icBX5Sr21YKHCdvUcw9rHh8wSDXfiP4BVD3euBKYYdi8Y5KUk at
// 00:47 UTC; the docs say 17 Oct). The wallet also receives plain treasury transfers and swaps its
// own SOL, so only inflows not signed by the wallet, in a tx that runs one of TRADE_PROGRAMS, count.
// The fee lands here in full and is kept by pump.fun. The referrer's cut on referred trades (0.40%
// rate, under 5% of fee-paying trades) is not split on-chain per trade; it is paid later from this
// pooled rewards wallet together with Callout Rewards, so it cannot be separated and is not deducted.
const PLATFORM_FEE_WALLET = 'BNrYNyQZhdGRs8Rvi98WGTjhxab2wFTdGtVjW72RGyh4'
const NATIVE_SOL = 'So11111111111111111111111111111111111111111' // tokens_solana.transfers id for native SOL
const TRADE_PROGRAMS = [
  APP_PROGRAM,
  '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P', // pump.fun bonding curve
  'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA', // PumpSwap
  'Dsug6JqUcLJaTJCx7ufPREeHjnMakmVEAYSi5oaAEnzK', // pump.fun program, same upgrade authority (7gZufwwA...) as the bonding curve
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', // Jupiter v6, app trades in non-pump tokens
  'DF1ow4tspfHX9JwWJsAb9epbkA8hmpSEAtxXy1V27QBH', // DFlow, app trades in non-pump tokens
]

const LABEL = {
  PlatformFee: 'Platform Fees',
  PumpFunProtocolFee: 'Pump Fun Protocol Fees',
  PumpFunCreatorFee: 'Pump Fun Creator Fees',
  PumpFunCashback: 'Pump Fun Cashback',
  PumpSwapProtocolFee: 'PumpSwap Protocol Fees',
  PumpSwapLpFee: 'PumpSwap LP Fees',
  PumpSwapCreatorFee: 'PumpSwap Creator Fees',
} as const

// Pump's TradeEvent reports the quote as the System Program id for SOL-quoted pairs.
const SYSTEM_PROGRAM = '11111111111111111111111111111111'
const normalizeQuoteMint = (mint?: string | null) => (!mint || mint === SYSTEM_PROGRAM) ? ADDRESSES.solana.SOL : mint

const fetch = async (options: FetchOptions) => {
  const rows = await queryDuneSql(options, `
    WITH app_tx AS (
        SELECT DISTINCT tx_id
        FROM solana.instruction_calls
        WHERE executing_account = '${APP_PROGRAM}'
          AND tx_success
          AND TIME_RANGE
    ),
    bonding AS (
        SELECT
            t.quote_mint AS mint,
            SUM(t.fee) AS protocol_fee,
            SUM(t.creator_fee) AS creator_fee,
            SUM(t.cashback) AS cashback
        FROM pumpdotfun_solana.pump_evt_tradeevent t
        JOIN app_tx a ON t.evt_tx_id = a.tx_id
        WHERE t.evt_block_time >= from_unixtime(${options.startTimestamp})
          AND t.evt_block_time <= from_unixtime(${options.endTimestamp})
        GROUP BY 1
    ),
    pools AS (
        -- same quote-mint allowlist as the parent pump-swap adapter: fees are denominated
        -- in the pool's quote token, so only priceable quotes are kept (mSOL and USDe are
        -- listed as raw mints because coreAssets has no entry for them).
        SELECT pool, quote_mint
        FROM pumpdotfun_solana.pump_amm_evt_createpoolevent
        WHERE quote_mint IN (
            '${ADDRESSES.solana.SOL}',
            'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
            '${ADDRESSES.solana.USDC}',
            '${ADDRESSES.solana.USDT}',
            '${ADDRESSES.solana.PUMP}',
            'DEkqHyPN7GMRJ5cArtQFAWefqbZb33Hyf6s5iCwjEonT'
        )
    ),
    amm_events AS (
        SELECT pool, protocol_fee, lp_fee, coin_creator_fee, evt_tx_id
        FROM pumpdotfun_solana.pump_amm_evt_buyevent
        WHERE evt_block_time >= from_unixtime(${options.startTimestamp})
          AND evt_block_time <= from_unixtime(${options.endTimestamp})
        UNION ALL
        SELECT pool, protocol_fee, lp_fee, coin_creator_fee, evt_tx_id
        FROM pumpdotfun_solana.pump_amm_evt_sellevent
        WHERE evt_block_time >= from_unixtime(${options.startTimestamp})
          AND evt_block_time <= from_unixtime(${options.endTimestamp})
    ),
    amm AS (
        SELECT
            p.quote_mint AS mint,
            SUM(e.protocol_fee) AS protocol_fee,
            SUM(e.coin_creator_fee) AS creator_fee,
            SUM(e.lp_fee) AS lp_fee
        FROM amm_events e
        JOIN app_tx a ON e.evt_tx_id = a.tx_id
        JOIN pools p ON e.pool = p.pool
        GROUP BY 1
    ),
    platform_in AS (
        SELECT tx_id, token_mint_address, amount
        FROM tokens_solana.transfers
        WHERE to_owner = '${PLATFORM_FEE_WALLET}'
          AND tx_signer <> '${PLATFORM_FEE_WALLET}'
          AND token_mint_address IN ('${NATIVE_SOL}', '${ADDRESSES.solana.SOL}', '${ADDRESSES.solana.USDC}')
          AND block_time >= TIMESTAMP '2026-10-16'
          AND TIME_RANGE
    ),
    platform AS (
        SELECT
            CASE WHEN token_mint_address = '${NATIVE_SOL}' THEN '${ADDRESSES.solana.SOL}' ELSE token_mint_address END AS mint,
            CAST(SUM(amount) AS double) AS platform_fee
        FROM platform_in
        WHERE tx_id IN (
            SELECT tx_id FROM solana.instruction_calls
            WHERE TIME_RANGE
              AND tx_success
              AND tx_id IN (SELECT tx_id FROM platform_in)
              AND executing_account IN (${TRADE_PROGRAMS.map(p => `'${p}'`).join(', ')})
        )
        GROUP BY 1
    )
    SELECT 'bonding' AS venue, mint, protocol_fee, creator_fee, cashback, CAST(0 AS double) AS lp_fee FROM bonding
    UNION ALL
    SELECT 'pumpswap' AS venue, mint, protocol_fee, creator_fee, CAST(0 AS double) AS cashback, lp_fee FROM amm
    UNION ALL
    SELECT 'platform' AS venue, mint, platform_fee AS protocol_fee, CAST(0 AS double) AS creator_fee, CAST(0 AS double) AS cashback, CAST(0 AS double) AS lp_fee FROM platform
  `)

  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  for (const row of rows) {
    const mint = normalizeQuoteMint(row.mint)
    if (row.venue === 'platform') {
      dailyFees.add(mint, row.protocol_fee, LABEL.PlatformFee)
      dailyRevenue.add(mint, row.protocol_fee, LABEL.PlatformFee)
      dailyProtocolRevenue.add(mint, row.protocol_fee, LABEL.PlatformFee)
      continue
    }
    const isBonding = row.venue === 'bonding'
    const protocolLabel = isBonding ? LABEL.PumpFunProtocolFee : LABEL.PumpSwapProtocolFee
    const creatorLabel = isBonding ? LABEL.PumpFunCreatorFee : LABEL.PumpSwapCreatorFee

    dailyFees.add(mint, row.protocol_fee ?? 0, protocolLabel)
    dailyRevenue.add(mint, row.protocol_fee ?? 0, protocolLabel)
    dailyProtocolRevenue.add(mint, row.protocol_fee ?? 0, protocolLabel)

    dailyFees.add(mint, row.creator_fee ?? 0, creatorLabel)
    dailySupplySideRevenue.add(mint, row.creator_fee ?? 0, creatorLabel)

    dailyFees.add(mint, row.cashback ?? 0, LABEL.PumpFunCashback)
    dailySupplySideRevenue.add(mint, row.cashback ?? 0, LABEL.PumpFunCashback)

    dailyFees.add(mint, row.lp_fee ?? 0, LABEL.PumpSwapLpFee)
    dailySupplySideRevenue.add(mint, row.lp_fee ?? 0, LABEL.PumpSwapLpFee)
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue }
}

const breakdownMethodology = {
  Fees: {
    [LABEL.PlatformFee]: 'Platform Fee of 0.45% (0.40% with a referral code) on pump.fun web and mobile app trades.',
    [LABEL.PumpFunProtocolFee]: "Pump's 0.95% slice of bonding-curve trade fees on trades placed through the pump.fun app.",
    [LABEL.PumpFunCreatorFee]: 'Coin-creator slice (0.30%) of bonding-curve trade fees on app trades.',
    [LABEL.PumpFunCashback]: 'Cashback Coins slice (0.30%, mutually exclusive with the creator slice per coin) of bonding-curve trade fees on app trades.',
    [LABEL.PumpSwapProtocolFee]: 'PumpSwap protocol fee on app trades.',
    [LABEL.PumpSwapLpFee]: 'PumpSwap liquidity-provider fee on app trades.',
    [LABEL.PumpSwapCreatorFee]: 'PumpSwap coin-creator fee on app trades.',
  },
  Revenue: {
    [LABEL.PlatformFee]: 'Platform Fee on web and mobile app trades, kept by pump.fun.',
    [LABEL.PumpFunProtocolFee]: "Pump's slice of bonding-curve trade fees on app trades, kept by the protocol.",
    [LABEL.PumpSwapProtocolFee]: 'PumpSwap protocol fee on app trades, kept by the protocol.',
  },
  ProtocolRevenue: {
    [LABEL.PlatformFee]: 'Platform Fee on web and mobile app trades, kept by pump.fun.',
    [LABEL.PumpFunProtocolFee]: "Pump's slice of bonding-curve trade fees on app trades, kept by the protocol.",
    [LABEL.PumpSwapProtocolFee]: 'PumpSwap protocol fee on app trades, kept by the protocol.',
  },
  SupplySideRevenue: {
    [LABEL.PumpFunCreatorFee]: 'Bonding-curve creator fees paid out to coin creators.',
    [LABEL.PumpFunCashback]: 'Cashback returned to traders/holders of Cashback Coins.',
    [LABEL.PumpSwapLpFee]: 'PumpSwap fees paid to liquidity providers.',
    [LABEL.PumpSwapCreatorFee]: 'PumpSwap creator fees paid out to coin creators.',
  },
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2026-05-21', // first tx of the app program
  doublecounted: true, // bonding-curve/PumpSwap fees are already counted in the parent pumpdotfun / pump-swap listings (the Platform Fee is not)
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  breakdownMethodology,
  methodology: {
    Fees: 'Platform Fee on pump.fun web and mobile app trades, plus pump.fun bonding-curve and PumpSwap trade fees on mobile app trades.',
    Revenue: 'Platform Fee plus the pump.fun and PumpSwap protocol fees on app trades.',
    ProtocolRevenue: 'Platform Fee plus the pump.fun and PumpSwap protocol fees on app trades.',
    SupplySideRevenue: 'Creator, cashback and LP fees on mobile app trades.',
  },
}

export default adapter
