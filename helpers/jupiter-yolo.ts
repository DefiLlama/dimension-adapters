export const YOLO_PROGRAM = 'yoLovHV5eT4DNPMG2Bu1NLmq8nVygEAPrNT1Rx6vWFA'
export const JUPUSD = 'JuprjznTrTSp2UFa3ZBUFgwdAmtZCq4MQCwysN55USD'
export const YOLO_START = '2026-10-14'

const EVENT_CPI_TAG = 'e445a52e51cb9a1d'
const TRADE_EVENT = `${EVENT_CPI_TAG}d01500d0e9956df6`
const TRADE_EVENT_HEX_LENGTH = 2 * (16 + 130)
export const YOLO_KIND = { open: '00', close: '01', liquidation: '02', winFee: '04' }

const LAYOUT_SINCE = 1791996000
export const uint = (offset: number, bytes: number) => {
  const pairs = Array.from({ length: bytes }, (_, i) => `SUBSTR(data_hex, ${2 * (offset + bytes - 1 - i) + 1}, 2)`)
  return `TO_NUMBER(${pairs.join(' || ')}, '${'X'.repeat(2 * bytes)}')`
}

const programEvents = (from: number, end: number) => `
    FROM solana.raw.inner_instructions
    WHERE program_id = '${YOLO_PROGRAM}'
      AND parent_tx_success = true
      AND block_timestamp >= TO_TIMESTAMP_NTZ(${from}) AND block_timestamp < TO_TIMESTAMP_NTZ(${end})
      AND LEFT(data_hex, 16) = '${EVENT_CPI_TAG}'`

export const yoloEventsCte = (from: number, end: number) => `yolo_events AS (
    SELECT block_timestamp, block_slot, txn_id, txn_index, instruction_index, inner_instruction_index,
      SUBSTR(data_hex, 33, 2) AS kind,
      SUBSTR(data_hex, 35, 64) AS market,
      SUBSTR(data_hex, 99, 64) AS owner,
      ${uint(81, 8)} AS event_id,
      ${uint(89, 8)} AS amount,
      ${uint(97, 8)} AS queued,
      ${uint(121, 1)} AS is_long,
      ${uint(122, 8)} AS margin,
      ${uint(130, 8)} AS notional,
      ${uint(138, 8)} AS price
    ${programEvents(from, end)}
      AND LEFT(data_hex, 32) = '${TRADE_EVENT}' AND LENGTH(data_hex) = ${TRADE_EVENT_HEX_LENGTH}
  )`

export const yoloGuardsCte = (from: number, end: number) => `yolo_guards AS (
    SELECT
      (
        SELECT COUNT(*)
        ${programEvents(Math.max(from, LAYOUT_SINCE), end)}
          AND NOT (LEFT(data_hex, 32) = '${TRADE_EVENT}' AND LENGTH(data_hex) = ${TRADE_EVENT_HEX_LENGTH})
      ) AS unknown_events,
      (
        SELECT MAX(block_timestamp) >= TO_TIMESTAMP_NTZ(${end})
        FROM solana.raw.inner_instructions
        WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${end - 600}) AND block_timestamp < TO_TIMESTAMP_NTZ(${end + 600})
      ) AS ingested
  )`

export function assertYoloGuards(row: any, end: number) {
  if (!row?.ingested) throw new Error(`jupiter-yolo: Allium has not ingested Solana up to ${end} yet`)
  if (Number(row.unknown_events) > 0) throw new Error(`jupiter-yolo: ${row.unknown_events} events with an unknown layout, the program was likely upgraded`)
}
