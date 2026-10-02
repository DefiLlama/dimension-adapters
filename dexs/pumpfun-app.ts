import ADDRESSES from '../helpers/coreAssets.json'
import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

// Pump.fun app (interface listing). Solana: pump.fun bonding-curve + PumpSwap trades in
// transactions invoking the app program (the web app never touches it). EVM: the app trades EVM
// tokens from the user's Solana balance through Relay; a request is attributed when its Solana
// wallet used the app program before it, within the previous 30 days.
const APP_PROGRAM = '6Vo3245eszAb5wuqEMw8mGdbfRUdKbHhDHP5LcaGuTAB'
const RELAY_SOLANA_ID = 792703809 // Relay's chain id for Solana
const SOLANA_NATIVE = '11111111111111111111111111111111' // Relay's token address for native SOL

// EVM starts: first day of app trading on each chain
const chainConfig: Record<string, { relayChainId: number, start: string }> = {
  [CHAIN.SOLANA]: { relayChainId: RELAY_SOLANA_ID, start: '2026-05-21' }, // first tx of the app program
  [CHAIN.ROBINHOOD]: { relayChainId: 4663, start: '2026-07-08' },
  [CHAIN.BSC]: { relayChainId: 56, start: '2026-07-02' },
  [CHAIN.BASE]: { relayChainId: 8453, start: '2026-07-02' },
  [CHAIN.ETHEREUM]: { relayChainId: 1, start: '2026-07-02' },
  [CHAIN.HYPERLIQUID]: { relayChainId: 999, start: '2026-08-04' },
  [CHAIN.ARC]: { relayChainId: 5042, start: '2026-09-15' },
}

// stable to stable requests are bridge transfers, not swaps (Arc's native gas token is USDC)
const EVM_STABLES = [
  ADDRESSES.ethereum.USDC, ADDRESSES.ethereum.USDT, ADDRESSES.base.USDC, ADDRESSES.base.USDT,
  ADDRESSES.bsc.USDC, ADDRESSES.bsc.USDT, ADDRESSES.hyperliquid.USDC, ADDRESSES.hyperliquid.USDT0,
  ADDRESSES.robinhood.USDG, ADDRESSES.arc.USDC,
].map(a => `'${a.toLowerCase()}'`).join(', ')

const MAX_INDEX_GAP = 15 * 60

const prefetch = async (options: FetchOptions) => {
  const start = options.startTimestamp
  const end = options.endTimestamp
  const evmChainIds = Object.values(chainConfig).map(c => c.relayChainId).filter(id => id !== RELAY_SOLANA_ID).join(', ')

  const rows = await queryDuneSql(options, `
    WITH app_tx AS (
        SELECT DISTINCT tx_id
        FROM solana.instruction_calls
        WHERE executing_account = '${APP_PROGRAM}'
          AND tx_success
          AND TIME_RANGE
    ),
    app_wallets AS (
        SELECT tx_signer AS wallet, MIN(block_time) AS first_use
        FROM solana.instruction_calls
        WHERE executing_account = '${APP_PROGRAM}'
          AND tx_success
          AND block_time >= from_unixtime(${start}) - INTERVAL '30' DAY
          AND block_time < from_unixtime(${end})
        GROUP BY 1
    ),
    solana_leg AS (
        SELECT ${RELAY_SOLANA_ID} AS chain_id, SUM(tr.amount_usd) AS volume, 0 AS unpriced
        FROM dex_solana.trades tr
        JOIN app_tx a ON tr.tx_id = a.tx_id
        WHERE tr.project IN ('pumpdotfun', 'pumpswap')
          AND tr.block_month BETWEEN date_trunc('month', from_unixtime(${start})) AND date_trunc('month', from_unixtime(${end}))
          AND tr.block_time >= from_unixtime(${start})
          AND tr.block_time < from_unixtime(${end})
    ),
    relay_requests AS (
        -- filled requests with exactly one leg on Solana
        SELECT
            created_at,
            IF(deposit_chain_id = ${RELAY_SOLANA_ID}, fill_chain_id, deposit_chain_id) AS chain_id,
            IF(deposit_chain_id = ${RELAY_SOLANA_ID}, sender, recipient) AS wallet,
            IF(deposit_chain_id = ${RELAY_SOLANA_ID}, deposit_token_address, fill_token_address) AS solana_token,
            lower(IF(deposit_chain_id = ${RELAY_SOLANA_ID}, fill_token_address, deposit_token_address)) AS evm_token,
            CAST(IF(deposit_chain_id = ${RELAY_SOLANA_ID}, deposit_user_amount_nominal, fill_user_amount_nominal) AS double) AS amount
        FROM relay.request
        WHERE date BETWEEN date(from_unixtime(${start})) AND date(from_unixtime(${end}))
          AND created_at >= from_unixtime(${start})
          AND created_at < from_unixtime(${end})
          AND ${RELAY_SOLANA_ID} IN (deposit_chain_id, fill_chain_id)
          AND deposit_chain_id <> fill_chain_id
          AND fill_tx_hash IS NOT NULL
    ),
    sol_price AS (
        SELECT timestamp AS hour, price
        FROM prices.hour
        WHERE blockchain = 'solana'
          AND contract_address = from_base58('${ADDRESSES.solana.SOL}')
          AND timestamp >= date_trunc('hour', from_unixtime(${start}))
          AND timestamp < from_unixtime(${end})
    ),
    relay_swaps AS (
        -- valued at the Solana leg: SOL/USDC/USDT paid on buys, received on sells
        SELECT
            r.chain_id,
            r.created_at,
            CASE WHEN r.solana_token IN ('${SOLANA_NATIVE}', '${ADDRESSES.solana.SOL}') THEN r.amount / 1e9 * p.price
                 ELSE r.amount / 1e6 END AS volume_usd
        FROM relay_requests r
        JOIN app_wallets w ON r.wallet = w.wallet AND w.first_use <= r.created_at
        LEFT JOIN sol_price p ON p.hour = date_trunc('hour', r.created_at)
        WHERE r.chain_id IN (${evmChainIds})
          AND r.solana_token IN ('${SOLANA_NATIVE}', '${ADDRESSES.solana.SOL}', '${ADDRESSES.solana.USDC}', '${ADDRESSES.solana.USDT}')
          AND NOT (
            r.solana_token IN ('${ADDRESSES.solana.USDC}', '${ADDRESSES.solana.USDT}')
            AND (r.evm_token IN (${EVM_STABLES}) OR (r.chain_id = 5042 AND r.evm_token = '${ADDRESSES.null}'))
          )
    ),
    -- source freshness from all rows in the last hour of the window, independent of app activity
    freshness AS (
        SELECT
            (SELECT to_unixtime(MAX(block_time)) FROM dex_solana.trades
             WHERE project IN ('pumpdotfun', 'pumpswap')
               AND block_month = date_trunc('month', from_unixtime(${end}) - INTERVAL '1' HOUR)
               AND block_time >= from_unixtime(${end}) - INTERVAL '1' HOUR
               AND block_time < from_unixtime(${end})) AS solana_last,
            (SELECT to_unixtime(MAX(created_at)) FROM relay.request
             WHERE date = date(from_unixtime(${end}) - INTERVAL '1' HOUR)
               AND created_at >= from_unixtime(${end}) - INTERVAL '1' HOUR
               AND created_at < from_unixtime(${end})) AS relay_last
    ),
    legs AS (
        SELECT chain_id, volume, unpriced FROM solana_leg
        UNION ALL
        SELECT chain_id, SUM(volume_usd) AS volume, COUNT_IF(volume_usd IS NULL) AS unpriced
        FROM relay_swaps
        GROUP BY 1
    )
    SELECT l.chain_id, l.volume, l.unpriced, f.solana_last, f.relay_last
    FROM legs l
    CROSS JOIN freshness f
  `)

  // solana_leg always returns one row, so rows[0] carries the freshness columns
  const { solana_last, relay_last } = rows[0]
  for (const [source, last] of Object.entries({ 'dex_solana.trades': Number(solana_last ?? 0), 'relay.request': Number(relay_last ?? 0) })) {
    if (last < end - MAX_INDEX_GAP)
      throw new Error(`pumpfun-app: ${source} not indexed through ${new Date(end * 1000).toISOString()} (last row ${last ? new Date(last * 1000).toISOString() : 'none in the final hour'})`)
  }
  const unpriced = rows.reduce((sum: number, r: any) => sum + Number(r.unpriced), 0)
  if (unpriced > 0) throw new Error(`pumpfun-app: ${unpriced} Relay swaps without a SOL price`)

  return rows
}

const fetch = async (options: FetchOptions) => {
  const { relayChainId } = chainConfig[options.chain]
  const row = options.preFetchedResults.find((r: any) => Number(r.chain_id) === relayChainId)
  return { dailyVolume: row?.volume ?? 0 }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  prefetch,
  adapter: chainConfig,
  doublecounted: true, // already counted in pump.fun, PumpSwap and the EVM DEXs
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Volume: 'Trades placed through the pump.fun mobile app: pump.fun and PumpSwap trades on Solana, plus EVM token swaps routed through Relay, valued at the SOL or stablecoin side.',
  },
}

export default adapter
