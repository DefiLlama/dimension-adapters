import ADDRESSES from "../../helpers/coreAssets.json";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";
import { assertComplete, programEventsSql } from "../../helpers/alliumSolanaEvents";
import { base58Encode } from "../../helpers/solana";

const FILL_LABEL = 'Grid Bot Fills'

const NEAR_GRID = 'grid.deltatrade.near'
const NEAR_TOKENS: { token: string; cgId: string; decimals: number }[] = [
  { token: '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1', cgId: 'usd-coin', decimals: 6 }, // native USDC
  { token: 'usdt.tether-token.near', cgId: 'tether', decimals: 6 }, // native USDt
  { token: 'wrap.near', cgId: 'near', decimals: 24 }, // wNEAR
  { token: 'nbtc.bridge.near', cgId: 'bitcoin', decimals: 8 }, // nBTC (Omni Bridge BTC)
]

const SOLANA_GRID = 'CNLGhYQgNwjyDfHZTEjHfk1MPkqwP96qZahWN82UfcLM'
const SOLANA_TOKENS = [ADDRESSES.solana.USDC, ADDRESSES.solana.USDT, ADDRESSES.solana.SOL]
const TAKE_ORDER_EVENT = 'A6B456E0CCD2F6D7'
const ORDER_UPDATE_EVENT = '4A570935B6504E4B'
const ALLIUM_ROW_CAP = 10_000 // queryAllium silently truncates results at this many rows

const fetchNear = async (options: FetchOptions) => {
  const rows = await queryAllium(`
    WITH events AS (
      SELECT id, event_name, event_data[0] AS d
      FROM near.raw.event_logs
      WHERE executor_id = '${NEAR_GRID}' AND event_standard = 'DeltaBot' AND event_name IN ('take_order', 'order_update')
        -- a receipt that panics keeps its logs but its fills are rolled back
        AND success
        AND transaction_block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
        AND transaction_block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
    ),
    orders AS (
      SELECT DISTINCT id, d:bot_id::STRING AS bot_id, d:forward_or_reverse::BOOLEAN AS fwd, d:level::STRING AS lvl,
        d:token_sell::STRING AS token_sell, d:token_buy::STRING AS token_buy
      FROM events WHERE event_name = 'order_update'
    ),
    fills AS (
      SELECT o.token_sell AS buy_token, TO_NUMBER(t.d:took_buy::STRING) AS buy_amount,
        o.token_buy AS sell_token, TO_NUMBER(t.d:took_sell::STRING) AS sell_amount
      FROM events t
      -- id is the receipt: the fill and its order updates are logged by the same receipt
      LEFT JOIN orders o ON o.id = t.id AND o.bot_id = t.d:maker_bot_id::STRING
        AND o.fwd = t.d:maker_forward_or_reverse::BOOLEAN AND o.lvl = t.d:maker_level::STRING
      WHERE t.event_name = 'take_order'
    ),
    pairs AS (
      SELECT buy_token, sell_token, SUM(buy_amount)::VARCHAR AS buy_amount, SUM(sell_amount)::VARCHAR AS sell_amount
      FROM fills WHERE buy_token IS NOT NULL
      GROUP BY 1, 2
    ),
    checks AS (
      SELECT
        (SELECT COUNT(*) FROM events WHERE event_name = 'take_order') AS takes,
        (SELECT COUNT(*) FROM fills) AS fill_rows,
        (SELECT COUNT_IF(buy_token IS NULL) FROM fills) AS unmatched,
        -- NEAR events land on Allium ~40 min late: a quiet window only counts once later events are there
        EXISTS (SELECT 1 FROM near.raw.event_logs
          WHERE transaction_block_timestamp >= TO_TIMESTAMP_NTZ(${options.endTimestamp})
            AND transaction_block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp + 900})) AS indexed
    )
    SELECT checks.*, pairs.* FROM checks LEFT JOIN pairs ON TRUE
  `)
  const checks = rows[0]
  if (!checks?.indexed)
    throw new Error(`delta-trade: Allium has not indexed NEAR past ${new Date(options.endTimestamp * 1e3).toISOString()} yet`)
  if (Number(checks.unmatched) > 0 || Number(checks.fill_rows) !== Number(checks.takes))
    throw new Error(`delta-trade: ${checks.takes} take_order events, ${checks.fill_rows} matched rows, ${checks.unmatched} without their order update`)

  const dailyVolume = options.createBalances()
  for (const { buy_token, sell_token, buy_amount, sell_amount } of rows) {
    if (!buy_token) continue // the checks row of a window without fills
    const leg = NEAR_TOKENS.find(({ token }) => token === buy_token || token === sell_token)
    if (!leg) continue // neither side is a token we can price (no such fill so far)
    const amount = leg.token === buy_token ? buy_amount : sell_amount
    dailyVolume.addCGToken(leg.cgId, Number(amount) / 10 ** leg.decimals, FILL_LABEL)
  }
  return { dailyVolume }
}

function decodeSolanaEvent(hex: string) {
  const b = Buffer.from(hex, 'hex')
  let o = 8
  const str = () => { const len = b.readUInt32LE(o); o += 4 + len; return b.toString('utf8', o - len, o) }
  const key = () => { o += 32; return base58Encode(b.subarray(o - 32, o)) }
  const u64 = () => { o += 8; return b.readBigUInt64LE(o - 8) }
  const order = () => { const bot = str(), userState = str(), fwd = b[o], level = b.readUInt16LE(o + 1); o += 3; return `${bot}:${userState}:${fwd}:${level}` }
  const expectEnd = (name: string, end: number) => {
    if (end !== b.length) throw new Error(`delta-trade: unknown ${name} layout (${b.length} bytes, expected ${end})`)
  }

  if (hex.startsWith(TAKE_ORDER_EVENT)) {
    o += 64 // taker, maker
    const event = { type: 'take' as const, order: order(), tookSell: u64(), tookBuy: u64() }
    expectEnd('TakeOrderEvent', o + 6 * 8) // takerFee, protocolFee, referralFee, currentRevenue, makerLeftRevenue, makerTotalRevenue
    return event
  }
  const event = { type: 'update' as const, order: order(), tokenSell: key(), tokenBuy: key() }
  o += 8 + 8 + 1 + 8 // amountSell, amountBuy, fillBuyOrSell, filled
  expectEnd('OrderUpdateEvent', o)
  return event
}

const fetchSolana = async (options: FetchOptions) => {
  const rows = await queryAllium(`${programEventsSql(SOLANA_GRID, options)}
    SELECT c.cut_txs, c.cut_tx, c.indexed, e.txn_id, e.frame, e.data
    FROM checks c
    LEFT JOIN program_events e ON STARTSWITH(e.data, '${TAKE_ORDER_EVENT}') OR STARTSWITH(e.data, '${ORDER_UPDATE_EVENT}')
  `)
  assertComplete(rows[0], 'delta-trade', options)
  if (rows.length >= ALLIUM_ROW_CAP) throw new Error(`delta-trade: ${rows.length} Solana events, the Allium result may be truncated`)

  const orders = new Map<string, { tokenSell: string; tokenBuy: string }>()
  const takes: { key: string; tookSell: bigint; tookBuy: bigint }[] = []
  for (const { txn_id, frame, data } of rows) {
    if (!data) continue // the checks row of a window without events
    const event = decodeSolanaEvent(data)
    // the fill and its order updates are emitted by the same take_orders call (frame)
    const key = `${txn_id}:${frame}:${event.order}`
    if (event.type === 'update') orders.set(key, { tokenSell: event.tokenSell, tokenBuy: event.tokenBuy })
    else takes.push({ key, tookSell: event.tookSell, tookBuy: event.tookBuy })
  }

  const dailyVolume = options.createBalances()
  for (const { key, tookSell, tookBuy } of takes) {
    const order = orders.get(key)
    if (!order) throw new Error(`delta-trade: no order update for the Solana fill ${key}`)
    const token = SOLANA_TOKENS.find((t) => t === order.tokenSell || t === order.tokenBuy)
    if (!token) continue // neither side is USDC, USDT or SOL (no such pair so far)
    dailyVolume.add(token, (token === order.tokenSell ? tookBuy : tookSell).toString(), FILL_LABEL)
  }
  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  // Allium lags 10-40 min: hourly runs would mostly hit the indexing checks and re-run the Solana log scan, a daily run does not
  version: 1,
  adapter: {
    [CHAIN.NEAR]: { fetch: fetchNear, start: '2024-04-27' },
    [CHAIN.SOLANA]: { fetch: fetchSolana, start: '2024-08-30' },
  },
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    Volume: "Value of the grid bot orders filled on Delta Trade, from the fill events of its NEAR (grid.deltatrade.near) and Solana grid contracts. Each fill is counted once, on its stablecoin side, else its NEAR, SOL or BTC side. DCA bot swaps are excluded because they are routed through Ref Finance, which already counts them.",
  },
  breakdownMethodology: {
    Volume: {
      [FILL_LABEL]: "Grid bot orders filled by takers on the Delta Trade grid contracts, counted once per fill.",
    },
  },
}

export default adapter
