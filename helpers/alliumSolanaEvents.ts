import { FetchOptions } from "../adapters/types";

// the byte at a 0-based offset of a hex column, and the little-endian u64 starting there
export const u8 = (column: string, offset: number) => `SUBSTR(${column}, ${2 * offset + 1}, 2)`;
export const u64 = (column: string, offset: number) =>
  `TO_NUMBER(${[7, 6, 5, 4, 3, 2, 1, 0].map((i) => u8(column, offset + i)).join(" || ")}, 'XXXXXXXXXXXXXXXX')`;

export const timeFilter = (options: FetchOptions, alias = "") =>
  `${alias}block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND ${alias}block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})`;

// programIds: one program, or several read together (program_events then tells them apart by `program`)
export function programEventsSql(programIds: string | string[], options: FetchOptions): string {
  const programs = [programIds].flat().map((id) => `'${id}'`).join(", ");
  return `
  WITH program_calls AS (
    -- every call of the program, by a user or by another program
    SELECT txn_id, COUNT(*) AS calls
    FROM (
      SELECT txn_id FROM solana.raw.instructions WHERE ${timeFilter(options)} AND program_id IN (${programs})
      UNION ALL
      SELECT txn_id FROM solana.raw.inner_instructions WHERE ${timeFilter(options)} AND program_id IN (${programs})
    )
    GROUP BY txn_id
  ),
  program_txs AS (
    SELECT t.txn_id, t.log_messages, c.calls
    FROM solana.raw.transactions t
    JOIN program_calls c ON c.txn_id = t.txn_id
    WHERE ${timeFilter(options, "t.")} AND t.success
  ),
  log_lines AS (
    -- The runtime writes "Program <id> invoke [<depth>]" when a program is called and "Program <id> success"
    -- when it returns. A program's own lines read "Program log:", "Program data:" or "Program return:", so
    -- they cannot pass for these. The network keeps about 10 kB of logs and then writes "Log truncated".
    SELECT t.txn_id, t.calls, l.index AS line, l.value::STRING AS msg,
      STARTSWITH(msg, 'Program ') AND NOT ENDSWITH(SPLIT_PART(msg, ' ', 2), ':') AS by_runtime,
      IFF(by_runtime AND SPLIT_PART(msg, ' ', 3) = 'invoke', SPLIT_PART(msg, ' ', 2), NULL) AS invoked,
      CASE WHEN invoked IS NOT NULL THEN 1 WHEN by_runtime AND SPLIT_PART(msg, ' ', 3) IN ('success', 'failed:') THEN -1 ELSE 0 END AS step,
      MIN(IFF(l.value::STRING = 'Log truncated', l.index, NULL)) OVER (PARTITION BY t.txn_id) AS truncated_at
    FROM program_txs t, LATERAL FLATTEN(input => t.log_messages) l
  ),
  log_depths AS (
    -- depth: that of the call a line belongs to; call_no: calls numbered in log order, like the instructions
    SELECT *,
      SUM(step) OVER (PARTITION BY txn_id ORDER BY line ROWS UNBOUNDED PRECEDING) + IFF(step = -1, 1, 0) AS depth,
      SUM(IFF(step = 1, 1, 0)) OVER (PARTITION BY txn_id ORDER BY line ROWS UNBOUNDED PRECEDING) - 1 AS call_no
    FROM log_lines
    WHERE truncated_at IS NULL OR line < truncated_at
  ),
  log_calls AS (
    -- A program can log arbitrary bytes, so an event is only trusted from the program that was running
    -- when it was written: the latest call opened at the line's depth.
    SELECT txn_id, calls, truncated_at, msg, step,
      LAST_VALUE(invoked) IGNORE NULLS OVER (PARTITION BY txn_id, depth ORDER BY line ROWS UNBOUNDED PRECEDING) AS program,
      LAST_VALUE(IFF(step = 1, call_no, NULL)) IGNORE NULLS OVER (PARTITION BY txn_id, depth ORDER BY line ROWS UNBOUNDED PRECEDING) AS frame
    FROM log_depths
  ),
  program_events AS (
    SELECT txn_id, frame, program, HEX_ENCODE(TRY_BASE64_DECODE_BINARY(SPLIT_PART(msg, ' ', 3))) AS data
    FROM log_calls
    WHERE program IN (${programs}) AND STARTSWITH(msg, 'Program data: ')
  ),
  cut_txs AS (
    -- logs cut before every call of the program had returned: the events of the other calls are lost
    SELECT txn_id
    FROM log_calls
    WHERE truncated_at IS NOT NULL
    GROUP BY txn_id, calls
    HAVING COUNT_IF(step = -1 AND program IN (${programs})) < calls
  ),
  checks AS (
    SELECT
      (SELECT COUNT(*) FROM cut_txs) AS cut_txs,
      (SELECT MIN(txn_id) FROM cut_txs) AS cut_tx,
      -- the transfers table, built from the raw ones, already holds blocks past the window, so a quiet
      -- window is not ingestion lag
      EXISTS (SELECT 1 FROM solana.assets.transfers
        WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.endTimestamp}) AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp + 900})) AS indexed
  )`;
}

export function assertComplete(row: any, adapter: string, options: FetchOptions) {
  if (!row) throw new Error(`${adapter}: empty Allium response`);
  if (!row.indexed)
    throw new Error(`${adapter}: Allium has not indexed Solana past ${new Date(options.endTimestamp * 1e3).toISOString()} yet`);
  if (Number(row.cut_txs) > 0)
    throw new Error(`${adapter}: the logs of ${row.cut_tx} (and ${Number(row.cut_txs) - 1} other transactions) were cut before every call returned, their events cannot be read`);
}
