import ADDRESSES from '../helpers/coreAssets.json'
import { Dependencies, FetchOptions, FetchResult, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { queryDuneSql } from '../helpers/dune'
import { getSolanaReceived } from '../helpers/token'

// Fanex — YouTube creator-token launchpad on Solana. New tokens trade on a custom on-chain
// bonding-curve program `fanex_curve` (program id CDPwGWGWbAE8FL5f2oVdzfkTutrnsKJcAcgqWktC3dwZ).
//
// Volume  → SOL paid into bonding-curve buys (fanex_curve `buy` instruction, arg `sol_in`).
//           Post-graduation Raydium CPMM trading is excluded — that volume is already counted by
//           Raydium. See the buy-side note on VOLUME_SQL below.
// Fees    → everything received by the Fanex fee wallet: the 6% fundraise share + 1% platform swap
//           fee on every trade, the 3% cut on creator dividend distributions, and harvested Raydium
//           CPMM LP fees. The 94% creator fundraise share is paid directly to creators and never
//           touches this wallet, so it is correctly excluded from protocol fees/revenue.
const FANEX_FEE_WALLET = 'FanexC732Lqr6k2vg93ipaRkpaUJx4vz47zfeeHj9MFx'

// Volume is taken from the decoded `buy` INSTRUCTION table (sol_in = exact SOL paid). Dune decoded
// the fanex_curve instruction tables (fanex_curve_call_buy / _call_sell) but NOT the emit_cpi! Trade
// EVENT table — fanex_curve_evt_trade is still empty weeks after the decode was accepted (Anchor's
// emit_cpi! writes the event as a self-CPI that Dune's decoder isn't materializing). This is
// therefore BUY-SIDE volume: sell realized-SOL isn't in the instruction args (call_sell only carries
// token_in + a min_sol_out slippage floor), so sells are not counted — a negligible share of early
// launchpad volume, which is heavily buy-dominated. When fanex_curve_evt_trade populates, switch to
// the commented event query below for exact buy + sell volume (Trade.sol_amount).
const VOLUME_SQL = (options: FetchOptions) => `
  SELECT COALESCE(SUM(sol_in), 0) AS volume_lamports
  FROM fanex_solana.fanex_curve_call_buy
  WHERE call_block_time >= from_unixtime(${options.startTimestamp})
    AND call_block_time <  from_unixtime(${options.endTimestamp})
`

// Upgrade path (exact buy + sell) once Dune decodes the emit_cpi! Trade event:
// const VOLUME_SQL = (options: FetchOptions) => `
//   SELECT COALESCE(SUM(sol_amount), 0) AS volume_lamports
//   FROM fanex_solana.fanex_curve_evt_trade
//   WHERE evt_block_time >= from_unixtime(${options.startTimestamp})
//     AND evt_block_time <  from_unixtime(${options.endTimestamp})
// `

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const [rows, dailyFees] = await Promise.all([
    queryDuneSql(options, VOLUME_SQL(options)),
    // If treasury top-ups from known Fanex-owned wallets ever need excluding, add `blacklists: [...]`.
    getSolanaReceived({ target: FANEX_FEE_WALLET, options }),
  ])

  const dailyVolume = options.createBalances()
  dailyVolume.add(ADDRESSES.solana.SOL, Number(rows?.[0]?.volume_lamports ?? 0))

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const adapter: SimpleAdapter = {
  // v1 is required for Dune-backed adapters: Dune runs once per day, so a v2
  // (hourly) adapter would needlessly re-run the same expensive query.
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2026-06-30', // first fanex_curve mainnet trade (2026-06-30T19:52:40Z)
  dependencies: [Dependencies.DUNE, Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology: {
    Volume: 'SOL paid into fanex_curve bonding-curve buys (the decoded buy instruction arg sol_in, fanex_solana.fanex_curve_call_buy). Buy-side only for now — the emit_cpi! Trade event that carries realized sell SOL is not yet decoded by Dune; sells are a negligible share of early volume. Post-graduation Raydium CPMM trading is excluded (counted by Raydium).',
    Fees: 'All value received by the Fanex fee wallet on Solana: the 6% fundraise share plus the 1% platform swap fee taken on every fanex_curve buy/sell, the 3% cut on creator dividend distributions, and harvested Raydium CPMM LP fees.',
    Revenue: 'Fanex retains 100% of what its fee wallet collects, so revenue equals fees.',
    ProtocolRevenue: 'Equal to revenue — all of it accrues to the Fanex treasury. The 94% creator fundraise share is paid directly to creators and is not received by this wallet.',
  },
}

export default adapter
