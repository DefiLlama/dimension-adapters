import ADDRESSES from '../helpers/coreAssets.json'
import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

// Pump.fun app (interface listing). Trades placed through the official pump.fun app
// invoke the app program below in the same transaction; fees are the pump.fun
// bonding-curve + PumpSwap trade fees on those trades, doublecounted with the parent
// pumpdotfun / pump-swap listings. Mayhem-mode trades zero their fee columns and are
// not counted; the PUMP buyback (holders revenue) stays in the parent adapter only.
const APP_PROGRAM = '6Vo3245eszAb5wuqEMw8mGdbfRUdKbHhDHP5LcaGuTAB'

const LABEL = {
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
    )
    SELECT 'bonding' AS venue, mint, protocol_fee, creator_fee, cashback, CAST(0 AS double) AS lp_fee FROM bonding
    UNION ALL
    SELECT 'pumpswap' AS venue, mint, protocol_fee, creator_fee, CAST(0 AS double) AS cashback, lp_fee FROM amm
  `)

  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  for (const row of rows) {
    const mint = normalizeQuoteMint(row.mint)
    const isBonding = row.venue === 'bonding'
    const protocolLabel = isBonding ? LABEL.PumpFunProtocolFee : LABEL.PumpSwapProtocolFee
    const creatorLabel = isBonding ? LABEL.PumpFunCreatorFee : LABEL.PumpSwapCreatorFee

    dailyFees.add(mint, row.protocol_fee ?? 0, protocolLabel)
    dailyRevenue.add(mint, row.protocol_fee ?? 0, protocolLabel)

    dailyFees.add(mint, row.creator_fee ?? 0, creatorLabel)
    dailySupplySideRevenue.add(mint, row.creator_fee ?? 0, creatorLabel)

    dailyFees.add(mint, row.cashback ?? 0, LABEL.PumpFunCashback)
    dailySupplySideRevenue.add(mint, row.cashback ?? 0, LABEL.PumpFunCashback)

    dailyFees.add(mint, row.lp_fee ?? 0, LABEL.PumpSwapLpFee)
    dailySupplySideRevenue.add(mint, row.lp_fee ?? 0, LABEL.PumpSwapLpFee)
  }

  return { dailyFees, dailyRevenue, dailySupplySideRevenue }
}

const breakdownMethodology = {
  Fees: {
    [LABEL.PumpFunProtocolFee]: "Pump's 0.95% slice of bonding-curve trade fees on trades placed through the pump.fun app.",
    [LABEL.PumpFunCreatorFee]: 'Coin-creator slice (0.30%) of bonding-curve trade fees on app trades.',
    [LABEL.PumpFunCashback]: 'Cashback Coins slice (0.30%, mutually exclusive with the creator slice per coin) of bonding-curve trade fees on app trades.',
    [LABEL.PumpSwapProtocolFee]: 'PumpSwap protocol fee on app trades.',
    [LABEL.PumpSwapLpFee]: 'PumpSwap liquidity-provider fee on app trades.',
    [LABEL.PumpSwapCreatorFee]: 'PumpSwap coin-creator fee on app trades.',
  },
  Revenue: {
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
  doublecounted: true, // app fees are already counted in the parent pumpdotfun / pump-swap listings
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  breakdownMethodology,
  methodology: {
    Fees: 'Pump.fun bonding-curve and PumpSwap trade fees generated by trades placed through the official pump.fun app (transactions invoking the app program). Already counted in the parent pump.fun and PumpSwap listings.',
    Revenue: "Pump's protocol slice of bonding-curve fees plus the PumpSwap protocol fee on app trades.",
    SupplySideRevenue: 'Creator and cashback slices of bonding-curve fees plus PumpSwap LP and creator fees on app trades.',
  },
}

export default adapter
