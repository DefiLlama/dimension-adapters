import { FetchOptions } from "../adapters/types";
import ADDRESSES from "./coreAssets.json";
import { queryAllium } from "./allium";
import { assertComplete, programEventsSql } from "./alliumSolanaEvents";
import { base58Encode, getAccountBuffers } from "./solana";

// Olive (https://olive.exchange): options, chooser options, perpetuals and expiry futures on Solana, traded against
// fully collateralized liquidity pools. Every figure below is read from the program's own Anchor events.
export const PROGRAM = 'ELfKgKXLdcnLaq3oHzJJHRCKUat9q2tJsxvr3NMbELbB';
export const START = '2026-09-19'; // mainnet launch of this program

// Byte layouts of the events read here, from the live program's IDL (Anchor event = 8-byte discriminator +
// Borsh struct). `vec` events carry `accounting: Vec<CustodyAccounting>` (80 bytes each) right after
// `company_fee_share_bps`, so their later fields sit at `base + k` with base = 20 + 80 × length; `abs` is a
// fixed byte offset in the payload. Layout changes since launch only appended fields.
export const EVENTS = {
  OptionPositionOpened: { discriminator: '287912A115FDCE30', vec: true, fields: { owner: { base: 0, type: 'pubkey' }, position_index: { base: 32, type: 'u64' }, lifecycle_sequence: { base: 341, type: 'u64' }, pool: { base: 72, type: 'pubkey' }, option_type: { base: 168, type: 'u8' }, strike_price: { base: 169, type: 'u64' }, remaining_quantity: { base: 185, type: 'u64' }, entry_spot_price: { base: 233, type: 'u64' }, remaining_premium_total_usd: { base: 225, type: 'u64' }, protocol_fee_usd: { base: 333, type: 'u64' } } },
  LimitOptionOrderExecuted: { discriminator: 'F2821D8CBB5E1E43', vec: true, fields: { owner: { base: 0, type: 'pubkey' }, position_index: { base: 64, type: 'u64' }, lifecycle_sequence: { base: 349, type: 'u64' }, pool: { base: 72, type: 'pubkey' }, option_type: { base: 200, type: 'u8' }, strike_price: { base: 217, type: 'u64' }, remaining_quantity: { base: 209, type: 'u64' }, execution_spot_price: { base: 233, type: 'u64' }, remaining_premium_total_usd: { base: 249, type: 'u64' }, protocol_fee_usd: { base: 341, type: 'u64' } } },
  OptionPositionClosed: { discriminator: '71E6612B65C85569', vec: true, fields: { close_premium_usd: { base: 217, type: 'u64' }, owner: { base: 0, type: 'pubkey' }, position_index: { base: 32, type: 'u64' }, remaining_quantity: { base: 153, type: 'u64' }, lifecycle_sequence: { base: 345, type: 'u64' }, pool: { base: 40, type: 'pubkey' }, option_type: { base: 136, type: 'u8' }, strike_price: { base: 137, type: 'u64' }, closed_quantity: { base: 201, type: 'u64' }, current_price: { base: 257, type: 'u64' }, protocol_fee_usd: { base: 241, type: 'u64' } } },
  OptionPositionExercised: { discriminator: 'B20DCF1F7C5F3245', vec: true, fields: { owner: { base: 0, type: 'pubkey' }, position_index: { base: 32, type: 'u64' }, remaining_quantity: { base: 153, type: 'u64' }, lifecycle_sequence: { base: 297, type: 'u64' }, pool: { base: 40, type: 'pubkey' }, option_type: { base: 136, type: 'u8' }, strike_price: { base: 137, type: 'u64' }, exercised_quantity: { base: 209, type: 'u64' } } },
  OptionPositionAutoExercised: { discriminator: 'CDF23DF7465D8EEA', vec: true, fields: { pool: { base: 40, type: 'pubkey' }, option_type: { base: 136, type: 'u8' }, strike_price: { base: 137, type: 'u64' }, auto_exercised_quantity: { base: 233, type: 'u64' }, settlement_underlying_price_e9: { base: 209, type: 'u64' } } },
  ChooserPositionOpened: { discriminator: 'D2C5FD08CA19D8C5', vec: true, fields: { pool: { base: 72, type: 'pubkey' }, quantity: { base: 225, type: 'u64' }, entry_spot_price: { base: 257, type: 'u64' }, remaining_premium_total_usd: { base: 249, type: 'u64' }, protocol_fee_usd: { base: 321, type: 'u64' } } },
  LimitChooserOrderExecuted: { discriminator: '73AD614F3FF2F8C8', vec: true, fields: { pool: { base: 104, type: 'pubkey' }, quantity: { base: 297, type: 'u64' }, entry_spot_price: { base: 329, type: 'u64' }, remaining_premium_total_usd: { base: 321, type: 'u64' }, protocol_fee_usd: { base: 361, type: 'u64' } } },
  ChooserPositionClosed: { discriminator: 'D18C3012D3825EC9', vec: true, fields: { close_value_usd: { base: 248, type: 'u64' }, pool: { base: 72, type: 'pubkey' }, closed_quantity: { base: 192, type: 'u64' }, current_price: { base: 304, type: 'u64' }, protocol_fee_usd: { base: 288, type: 'u64' } } },
  ChooserTpSlOrderExecuted: { discriminator: 'B95066819965D25E', vec: true, fields: { close_value_usd: { base: 248, type: 'u64' }, pool: { base: 72, type: 'pubkey' }, closed_quantity: { base: 192, type: 'u64' }, current_price: { base: 304, type: 'u64' }, protocol_fee_usd: { base: 288, type: 'u64' } } },
  ChooserChosen: { discriminator: '78F41F677136BDC2', vec: true, fields: { pool: { base: 72, type: 'pubkey' }, quantity: { base: 170, type: 'u64' }, current_price: { base: 307, type: 'u64' }, settled_immediately: { base: 218, type: 'bool' } } },
  ChooserConverted: { discriminator: 'C58EC2DB0F66C68F', vec: true, fields: { owner: { base: 0, type: 'pubkey' }, position_index: { base: 32, type: 'u64' }, lifecycle_sequence: { base: 341, type: 'u64' }, pool: { base: 72, type: 'pubkey' }, option_type: { base: 168, type: 'u8' }, strike_price: { base: 169, type: 'u64' }, remaining_quantity: { base: 185, type: 'u64' }, entry_spot_price: { base: 233, type: 'u64' } } },
  PerpPositionOpened: { discriminator: 'B500F69A6FFC29D6', vec: true, fields: { owner: { base: 40, type: 'pubkey' }, pool: { base: 72, type: 'pubkey' }, position_index: { base: 0, type: 'u64' }, lifecycle_sequence: { base: 267, type: 'u64' }, custody: { base: 104, type: 'pubkey' }, position_key: { base: 8, type: 'pubkey' }, base_quantity_native: { base: 146, type: 'u64' }, entry_spot_price: { base: 138, type: 'u64' } } },
  LimitOrderExecuted: { discriminator: 'E6604F6ED0E1D6F3', vec: true, fields: { owner: { base: 72, type: 'pubkey' }, pool: { base: 104, type: 'pubkey' }, position_index: { base: 0, type: 'u64' }, lifecycle_sequence: { base: 258, type: 'u64' }, custody: { base: 136, type: 'pubkey' }, position_key: { base: 40, type: 'pubkey' }, base_quantity_native: { base: 185, type: 'u64' }, execution_spot_price: { base: 177, type: 'u64' } } },
  PerpPositionClosed: { discriminator: '27FF6B1E0BFFB95E', vec: true, fields: { owner: { base: 40, type: 'pubkey' }, pool: { base: 72, type: 'pubkey' }, position_index: { base: 0, type: 'u64' }, lifecycle_sequence: { base: 331, type: 'u64' }, custody: { base: 104, type: 'pubkey' }, position_key: { base: 8, type: 'pubkey' }, closed_base_quantity_native: { base: 146, type: 'u64' }, remaining_base_quantity_native: { base: 154, type: 'u64' }, current_spot_price: { base: 194, type: 'u64' }, trade_fees_paid_usd: { base: 315, type: 'u64' }, borrow_fees_paid_usd: { base: 323, type: 'u64' } } },
  PositionLiquidated: { discriminator: '286B5AD6601E3D80', vec: true, fields: { custody: { base: 136, type: 'pubkey' }, base_quantity_native: { base: 178, type: 'u64' }, liquidation_trigger_spot_price: { base: 202, type: 'u64' }, trade_fees_paid_usd: { base: 307, type: 'u64' }, borrow_fees_paid_usd: { base: 315, type: 'u64' } } },
  TpSlOrderExecuted: { discriminator: 'CA2F877DAFE47E4D', vec: true, fields: { opened_at: { base: 254, type: 'u64' }, owner: { base: 40, type: 'pubkey' }, pool: { base: 72, type: 'pubkey' }, position_index: { base: 0, type: 'u64' }, lifecycle_sequence: { base: 335, type: 'u64' }, custody: { base: 104, type: 'pubkey' }, position_key: { base: 8, type: 'pubkey' }, contract_type: { base: 178, type: 'u8' }, executed_price: { base: 189, type: 'u64' }, executed_size_percent: { base: 197, type: 'u64' }, is_full_close: { base: 294, type: 'bool' }, trade_fees_paid_usd: { base: 214, type: 'u64' }, borrow_fees_paid_usd: { base: 222, type: 'u64' }, execution_spot_price: { base: 327, type: 'u64' } } },
  FuturePositionOpened: { discriminator: '39BCD9D182B4F9B6', vec: true, fields: { owner: { base: 0, type: 'pubkey' }, pool: { base: 72, type: 'pubkey' }, position_index: { base: 64, type: 'u64' }, lifecycle_sequence: { base: 278, type: 'u64' }, custody: { base: 104, type: 'pubkey' }, position_key: { base: 32, type: 'pubkey' }, base_quantity_native: { base: 153, type: 'u64' }, entry_spot_price: { base: 137, type: 'u64' } } },
  LimitFutureOrderExecuted: { discriminator: '8BDF68E2951887BE', vec: true, fields: { owner: { base: 0, type: 'pubkey' }, pool: { base: 104, type: 'pubkey' }, position_index: { base: 96, type: 'u64' }, lifecycle_sequence: { base: 278, type: 'u64' }, custody: { base: 136, type: 'pubkey' }, position_key: { base: 64, type: 'pubkey' }, base_quantity_native: { base: 209, type: 'u64' }, execution_spot_price: { base: 193, type: 'u64' } } },
  FuturePositionClosed: { discriminator: 'A310A6B3AF18B619', vec: true, fields: { owner: { base: 0, type: 'pubkey' }, pool: { base: 72, type: 'pubkey' }, position_index: { base: 64, type: 'u64' }, lifecycle_sequence: { base: 330, type: 'u64' }, custody: { base: 104, type: 'pubkey' }, position_key: { base: 32, type: 'pubkey' }, closed_base_quantity_native: { base: 145, type: 'u64' }, remaining_base_quantity_native: { base: 153, type: 'u64' }, current_spot_price: { base: 202, type: 'u64' }, trade_fees_paid_usd: { base: 322, type: 'u64' } } },
  FuturePositionSettled: { discriminator: 'A4BAE1AEACFFCA18', vec: true, fields: { custody: { base: 104, type: 'pubkey' }, settled_base_quantity_native: { base: 137, type: 'u64' }, settlement_spot_price: { base: 153, type: 'u64' } } },
  FuturePositionLiquidated: { discriminator: '50B099E518865E02', vec: true, fields: { custody: { base: 136, type: 'pubkey' }, liquidated_base_quantity_native: { base: 169, type: 'u64' }, liquidation_trigger_spot_price: { base: 201, type: 'u64' }, liquidation_fee: { base: 225, type: 'u64' } } },
  LiquidityAdded: { discriminator: '9A1ADD6CEE40D9A1', vec: true, fields: { custody: { base: 64, type: 'pubkey' }, fee_amount: { base: 120, type: 'u64' }, deposit_amount: { base: 104, type: 'u64' }, token_amount_usd: { base: 128, type: 'u64' } } },
  LiquidityRemoved: { discriminator: 'E169D8277C74A9BD', vec: true, fields: { custody: { base: 64, type: 'pubkey' }, fee_amount: { base: 112, type: 'u64' } } },
  TradeRequestFilled: { discriminator: '48FA68E8784389DE', vec: false, fields: { pool: { abs: 104, type: 'pubkey' }, fill_price: { abs: 169, type: 'u64' } } },
} as const;

type Field = { base?: number; abs?: number; type: string };

// Byte offset of a field inside the hex payload, as a SQL expression.
const offset = (field: Field) => (field.base !== undefined ? `(base + ${field.base})` : `${field.abs}`);
const byte = (at: string, i: number) => `SUBSTR(data, 2 * (${at} + ${i}) + 1, 2)`;
// Little-endian unsigned integer of `size` bytes.
const uint = (field: Field, size: number) => {
  const at = offset(field);
  const digits = Array.from({ length: size }, (_, i) => byte(at, size - 1 - i)).join(' || ');
  return `TO_NUMBER(${digits}, '${'X'.repeat(2 * size)}')`;
};
const read = (field: Field) => {
  if (field.type === 'u64') return uint(field, 8);
  if (field.type === 'u8' || field.type === 'bool') return uint(field, 1);
  if (field.type === 'pubkey') return `SUBSTR(data, 2 * ${offset(field)} + 1, 64)`;
  throw new Error(`olive-exchange: no reader for ${field.type}`);
};

type EventName = keyof typeof EVENTS;

// One CTE per event: its rows with the named fields decoded, plus txn_id for same-transaction joins.
function eventCte(name: EventName): string {
  const event = EVENTS[name];
  const fields = Object.entries(event.fields).map(([fieldName, field]) => `${read(field as Field)} AS ${fieldName}`);
  // vec events open with company_fee_share_bps: the share of this event's fees paid to Olive, in basis points
  if (event.vec) fields.push(`${read({ abs: 8, type: 'u64' })} AS bps`);
  // vec events: the accounting list length is the u32 at payload bytes 16..19
  const base = event.vec
    ? `20 + 80 * TO_NUMBER(SUBSTR(data, 39, 2) || SUBSTR(data, 37, 2) || SUBSTR(data, 35, 2) || SUBSTR(data, 33, 2), 'XXXXXXXX') AS base`
    : `0 AS base`;
  return `${name} AS (
    SELECT txn_id, ${fields.join(', ')}
    FROM (SELECT txn_id, data, ${base} FROM program_events WHERE STARTSWITH(data, '${event.discriminator}'))
  )`;
}

// Runs one Allium query: the program's events in the window decoded per event, `ctes` built on them, and
// `select` summarising them (one row per group; every row also carries the helper's completeness checks).
export const oliveEventsSql = (options: FetchOptions, events: EventName[], ctes: string, select: string) => `${programEventsSql(PROGRAM, options)},
  ${events.map(eventCte).join(',\n  ')},
  ${ctes}
  SELECT checks.*, summary.*
  FROM checks
  LEFT JOIN (${select}) summary ON TRUE`;

export async function queryOliveEvents(options: FetchOptions, events: EventName[], ctes: string, select: string): Promise<any[]> {
  const rows = await queryAllium(oliveEventsSql(options, events, ctes, select));
  assertComplete(rows[0], 'olive-exchange', options);
  return rows;
}

export const pubkey = (hex: string) => base58Encode(Buffer.from(hex, 'hex'));

// Take-profit and stop-loss fills record the share of the position they closed (executed_size_percent,
// 100_000_000 = 100 %), not the size. A position is (contract type, owner, pool, index): the index comes from
// a per-owner counter, so it is never reused, and every action on the position carries the next
// lifecycle_sequence. The size before a fill is the size after the position's previous action.
export const TP_SL_COLUMNS = ['contract_type', 'owner', 'pool', 'position_index', 'lifecycle_sequence', 'executed_size_percent', 'is_full_close', 'custody', 'execution_spot_price', 'executed_price', 'opened_at'];

// The window's TP/SL fills of the given contract types (0 perp, 1 option, 2 future), as rows of a summary
// SELECT whose other columns are `leading` (NULLs or constants matching the summary's first columns).
export const tpSlRowsSql = (contractTypes: number[], leading: string) => `
  SELECT ${leading}, ${TP_SL_COLUMNS.map((column) => `${column}::VARCHAR`).join(', ')}
  FROM TpSlOrderExecuted WHERE contract_type IN (${contractTypes.join(', ')})`;
export const noTpSlColumns = TP_SL_COLUMNS.map((column) => `NULL AS ${column}`).join(', ');

// Every action that leaves a position with a known size, per contract type: [event, size after the action].
const SIZE_EVENTS: [EventName, number, string][] = [
  ['PerpPositionOpened', 0, 'base_quantity_native'],
  ['LimitOrderExecuted', 0, 'base_quantity_native'],
  ['PerpPositionClosed', 0, 'remaining_base_quantity_native'],
  ['OptionPositionOpened', 1, 'remaining_quantity'],
  ['LimitOptionOrderExecuted', 1, 'remaining_quantity'],
  ['OptionPositionClosed', 1, 'remaining_quantity'],
  ['OptionPositionExercised', 1, 'remaining_quantity'],
  ['ChooserConverted', 1, 'remaining_quantity'],
  ['FuturePositionOpened', 2, 'base_quantity_native'],
  ['LimitFutureOrderExecuted', 2, 'base_quantity_native'],
  ['FuturePositionClosed', 2, 'remaining_base_quantity_native'],
];
// option events that also carry the option's type and strike
const OPTION_TERMS: EventName[] = ['OptionPositionOpened', 'LimitOptionOrderExecuted', 'ChooserConverted'];

// executedPrice: the price the trigger fired at (an option's premium per contract, USD × 1e6)
export type TpSlFill = { contractType: number; custody: string; spot: bigint; executedPrice: bigint; quantity: bigint; optionType?: number; strike?: bigint };

// Sizes the window's TP/SL fills (rows from tpSlRowsSql) from their positions' history. The lookup reads only
// from the earliest of those positions' openings to the window's end, and keeps only their events. Its range is
// checked for complete logs like any window: a lost close would mis-size the fill, so it fails instead.
export async function sizeTpSlFills(options: FetchOptions, rows: any[]): Promise<TpSlFill[]> {
  const fills = rows.filter((row) => row.lifecycle_sequence != null);
  if (!fills.length) return [];
  const key = (row: any) => [row.contract_type, row.owner, row.pool, row.position_index].join(':');
  const positions = [...new Set(fills.map((row) => `'${key(row)}'`))].join(', ');
  const openedAt = Math.min(...fills.map((row) => Number(row.opened_at)));
  if (!Number.isFinite(openedAt) || openedAt > options.endTimestamp) throw new Error('olive-exchange: TP/SL fill without a valid opening time');
  const history = SIZE_EVENTS.map(([event, contractType, size]) => {
    const terms = OPTION_TERMS.includes(event) ? 'option_type, strike_price' : 'NULL, NULL';
    return `SELECT ${contractType} AS contract_type, owner, pool, position_index, lifecycle_sequence, ${size} AS size_after, NULL AS executed_size_percent, NULL AS is_full_close, ${terms} FROM ${event}`;
  });
  history.push(`SELECT contract_type, owner, pool, position_index, lifecycle_sequence, NULL, executed_size_percent, is_full_close, NULL, NULL FROM TpSlOrderExecuted`);
  const columns = ['contract_type', 'owner', 'pool', 'position_index', 'lifecycle_sequence', 'size_after', 'executed_size_percent', 'is_full_close', 'option_type', 'strike_price'];
  const sinceOpening = { ...options, startTimestamp: openedAt - 60 };
  const actions = await queryOliveEvents(sinceOpening, [...new Set([...SIZE_EVENTS.map(([event]) => event), 'TpSlOrderExecuted' as EventName])], `
    position_actions (${columns.join(', ')}) AS (
      ${history.join('\n      UNION ALL ')}
    )`, `
    SELECT ${columns.map((column) => `${column}::VARCHAR AS ${column}`).join(', ')} FROM position_actions
    WHERE contract_type || ':' || owner || ':' || pool || ':' || position_index IN (${positions})
  `);

  // walk each position's actions in order, keeping its size and the quantity each TP/SL fill closed
  const byPosition: Record<string, any[]> = {};
  for (const action of actions) if (action.lifecycle_sequence != null) (byPosition[key(action)] ??= []).push(action);
  const closed: Record<string, { quantity: bigint; optionType?: number; strike?: bigint }> = {};
  for (const [position, list] of Object.entries(byPosition)) {
    list.sort((a, b) => Number(BigInt(a.lifecycle_sequence) - BigInt(b.lifecycle_sequence)));
    let size = 0n;
    let terms: { optionType?: number; strike?: bigint } = {};
    for (const action of list) {
      if (action.option_type != null) terms = { optionType: Number(action.option_type), strike: BigInt(action.strike_price) };
      if (action.size_after != null) { size = BigInt(action.size_after); continue; }
      // the program closes floor(size × percent / 100_000_000), or the whole size on a full close
      const quantity = action.is_full_close === '1' ? size : (size * BigInt(action.executed_size_percent)) / 100_000_000n;
      closed[`${position}:${action.lifecycle_sequence}`] = { quantity, ...terms };
      size -= quantity;
    }
  }

  return fills.map((row) => {
    const sized = closed[`${key(row)}:${row.lifecycle_sequence}`];
    if (!sized) throw new Error(`olive-exchange: no history for the TP/SL fill of position ${key(row)} at step ${row.lifecycle_sequence}`);
    return { contractType: Number(row.contract_type), custody: row.custody, spot: BigInt(row.execution_spot_price), executedPrice: BigInt(row.executed_price), ...sized };
  });
}

// A custody account holds its mint (bytes 8..39) and its pricing decimals (byte 72): the mint decimals, plus the
// price-unit exponent for pools priced per 10^n tokens (1MPEPE = one million PEPE).
export async function readCustodies(custodies: string[]): Promise<Record<string, { mint: string; decimals: number }>> {
  const unique = [...new Set(custodies)];
  if (!unique.length) return {};
  const buffers = await getAccountBuffers({ chain: 'solana', accounts: unique });
  const result: Record<string, { mint: string; decimals: number }> = {};
  unique.forEach((custody, i) => {
    const data = buffers[i];
    if (!data) throw new Error(`olive-exchange: custody account ${custody} not found`);
    result[custody] = { mint: base58Encode(data.subarray(8, 40)), decimals: data[72] };
  });
  return result;
}

export const isUsdc = (mint: string) => mint === ADDRESSES.solana.USDC;
