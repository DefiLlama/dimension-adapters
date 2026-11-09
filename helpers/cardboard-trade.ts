import { FetchOptions } from '../adapters/types'
import { queryAllium } from './allium'

// Cardboard Trade (https://cardboardtrade.xyz, docs https://docs.cardboardtrade.xyz): USDC-margined BTC, ETH and SOL
// perpetuals on Solana. Every position trades against the exchange's own house balance (no order book), at 1x to 1000x
// leverage, with no funding payments. A position is opened and closed whole: margin and leverage cannot change after the
// open and there are no partial closes.
export const CARDBOARD_PROGRAM = 'J7vt5nGQd7YggFTV6GPwmWycfxzLjnHoGX6GRUKo9M7A'
export const CARDBOARD_START = '2026-10-15'
const START_TIMESTAMP = Math.floor(Date.parse(CARDBOARD_START) / 1e3)

const EVENT = '435445564e54000001'
const OPEN = `${EVENT}06`
const CLOSE = `${EVENT}07`
const LIQUIDATION = `${EVENT}08`

// A close that executes at or past the bust price is settled as a liquidation (the whole margin is forfeited).
// Bust price = entry * (1 - 1 / leverage + buffer) for a long, mirrored for a short. The buffer is 5 bps on every market
// since launch (liquidation_buffer_bps of the market accounts, https://docs.cardboardtrade.xyz/liquidations.html).
// With it, liquidation volume matches the exchange's own liquidation_volume stat exactly up to 2026-10-17 10:00 UTC.
const LIQUIDATION_BUFFER_BPS = 5

// Bounds the Allium scan, which otherwise grows with the program's history on every run. Positions are held for minutes
// (p99 under 5 hours, longest 15 hours by 2026-10-17), so a close is matched to its open within this lookback first, and
// only a close whose open is older triggers a scan from launch.
const LOOKBACK = 2 * 86400

const uint = (offset: number, bytes: number) => {
  const pairs = Array.from({ length: bytes }, (_, i) => `SUBSTR(data_hex, ${2 * (offset + bytes - 1 - i) + 1}, 2)`)
  return `TO_NUMBER(${pairs.join(' || ')}, '${'X'.repeat(2 * bytes)}')`
}

const allIngestedCheck = (end: number) => `
  SELECT MAX(block_timestamp) >= TO_TIMESTAMP_NTZ(${end}) AS ingested
  FROM solana.raw.inner_instructions
  WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${end - 600}) AND block_timestamp < TO_TIMESTAMP_NTZ(${end + 600})`

export type CardboardMarketFlows = {
  market_id: number
  open_size: string
  close_size: string
  liquidated_size: string
  liquidated_margin: string
  close_fees: string
  liquidation_fees: string
  orphans: number
}

const queryFlows = (start: number, end: number, scanFrom: number) => queryAllium(`
  WITH ev AS (
    SELECT block_timestamp,
      LEFT(data_hex, 20) AS kind,
      ${uint(10, 1)} AS market_id,
      SUBSTR(data_hex, 233, 64) AS owner,
      ${uint(148, 8)} AS position_id,
      ${uint(156, 8)} AS price,
      ${uint(164, 8)} AS margin,
      ${uint(172, 2)} AS leverage,
      ${uint(174, 1)} AS is_long,
      ${uint(172, 8)} AS fees
    FROM solana.raw.inner_instructions
    WHERE program_id = '${CARDBOARD_PROGRAM}'
      AND parent_tx_success = true
      AND block_timestamp >= TO_TIMESTAMP_NTZ(${scanFrom}) AND block_timestamp < TO_TIMESTAMP_NTZ(${end})
      AND LEFT(data_hex, 20) IN ('${OPEN}', '${CLOSE}', '${LIQUIDATION}')
  ),
  opens AS (
    SELECT owner, position_id, price AS entry_price, margin, leverage, is_long FROM ev WHERE kind = '${OPEN}'
  ),
  settled AS (
    SELECT e.market_id, e.kind, e.price AS exit_price, e.fees, o.entry_price, o.margin, o.leverage,
      e.kind = '${LIQUIDATION}'
        OR (CASE WHEN o.is_long = 1 THEN o.entry_price - e.price ELSE e.price - o.entry_price END) * o.leverage * 10000
          >= o.entry_price * (10000 - ${LIQUIDATION_BUFFER_BPS} * o.leverage) AS liquidated
    FROM ev e
    LEFT JOIN opens o ON o.owner = e.owner AND o.position_id = e.position_id
    WHERE e.kind IN ('${CLOSE}', '${LIQUIDATION}')
      AND e.block_timestamp >= TO_TIMESTAMP_NTZ(${start})
  ),
  window_opens AS (
    SELECT market_id, SUM(margin * leverage) AS open_size
    FROM ev
    WHERE kind = '${OPEN}' AND block_timestamp >= TO_TIMESTAMP_NTZ(${start})
    GROUP BY 1
  ),
  window_settled AS (
    SELECT market_id,
      SUM(CASE WHEN NOT liquidated THEN ROUND(margin * leverage * exit_price / entry_price) END) AS close_size,
      SUM(CASE WHEN liquidated THEN margin * leverage END) AS liquidated_size,
      SUM(CASE WHEN liquidated THEN margin END) AS liquidated_margin,
      SUM(CASE WHEN NOT liquidated THEN fees END) AS close_fees,
      SUM(CASE WHEN liquidated THEN fees END) AS liquidation_fees,
      COUNT_IF(entry_price IS NULL) AS orphans
    FROM settled
    GROUP BY 1
  ),
  flows AS (
    SELECT COALESCE(o.market_id, w.market_id) AS market_id,
      TO_VARCHAR(COALESCE(o.open_size, 0)::NUMBER(38, 0)) AS open_size,
      TO_VARCHAR(COALESCE(w.close_size, 0)::NUMBER(38, 0)) AS close_size,
      TO_VARCHAR(COALESCE(w.liquidated_size, 0)::NUMBER(38, 0)) AS liquidated_size,
      TO_VARCHAR(COALESCE(w.liquidated_margin, 0)::NUMBER(38, 0)) AS liquidated_margin,
      TO_VARCHAR(COALESCE(w.close_fees, 0)::NUMBER(38, 0)) AS close_fees,
      TO_VARCHAR(COALESCE(w.liquidation_fees, 0)::NUMBER(38, 0)) AS liquidation_fees,
      COALESCE(w.orphans, 0) AS orphans
    FROM window_opens o
    FULL OUTER JOIN window_settled w ON w.market_id = o.market_id
  ),
  ingestion AS (${allIngestedCheck(end)})
  SELECT i.ingested, f.*
  FROM ingestion i
  LEFT JOIN flows f ON TRUE
`)

// Per-market trades in the window: opens, closes, liquidations and the fees charged on them
export async function fetchCardboardFlows(options: FetchOptions): Promise<CardboardMarketFlows[]> {
  const { startTimestamp: start, endTimestamp: end } = options
  let scanFrom = Math.max(START_TIMESTAMP, start - LOOKBACK)
  let rows = await queryFlows(start, end, scanFrom)
  if (rows.some((row: any) => Number(row.orphans) > 0) && scanFrom > START_TIMESTAMP) {
    scanFrom = START_TIMESTAMP
    rows = await queryFlows(start, end, scanFrom)
  }
  if (!rows[0]?.ingested) throw new Error(`cardboard-trade: Allium has not ingested Solana up to ${end} yet`)
  const markets: CardboardMarketFlows[] = rows.filter((row: any) => row.market_id !== null && row.market_id !== undefined)
  for (const row of markets) {
    if (Number(row.orphans) > 0) throw new Error(`cardboard-trade: ${row.orphans} settled positions in market ${row.market_id} have no open event`)
  }
  return markets
}

export async function fetchCardboardActiveUsers(options: FetchOptions): Promise<number> {
  const { startTimestamp: start, endTimestamp: end } = options
  const [row] = await queryAllium(`
    SELECT COUNT(DISTINCT SUBSTR(data_hex, 233, 64)) AS users,
      (${allIngestedCheck(end)}) AS ingested
    FROM solana.raw.inner_instructions
    WHERE program_id = '${CARDBOARD_PROGRAM}'
      AND parent_tx_success = true
      AND block_timestamp >= TO_TIMESTAMP_NTZ(${start}) AND block_timestamp < TO_TIMESTAMP_NTZ(${end})
      AND LEFT(data_hex, 20) IN ('${OPEN}', '${CLOSE}')
  `)
  if (!row?.ingested) throw new Error(`cardboard-trade: Allium has not ingested Solana up to ${end} yet`)
  return Number(row.users)
}

export async function fetchCardboardNewUsers(options: FetchOptions): Promise<number> {
  const { startTimestamp: start, endTimestamp: end } = options
  const [row] = await queryAllium(`
    SELECT COUNT(DISTINCT SUBSTR(data_hex, 233, 64)) AS users,
      (${allIngestedCheck(end)}) AS ingested
    FROM solana.raw.inner_instructions
    WHERE program_id = '${CARDBOARD_PROGRAM}'
      AND parent_tx_success = true
      AND block_timestamp >= TO_TIMESTAMP_NTZ(${start}) AND block_timestamp < TO_TIMESTAMP_NTZ(${end})
      AND LEFT(data_hex, 20) = '${OPEN}'
      AND ${uint(148, 8)} = 0
  `)
  if (!row?.ingested) throw new Error(`cardboard-trade: Allium has not ingested Solana up to ${end} yet`)
  return Number(row.users)
}
