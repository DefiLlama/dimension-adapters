import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FetchOptions, FetchV2 } from '../adapters/types';
import adapter from '../aggregators/opensea';
import { solanaVolumeQuery } from '../aggregators/opensea/solana';

const { DatabaseSync } = require('node:sqlite');
const dune = require('../helpers/dune');
const fetch = adapter.fetch as FetchV2;
const START = Date.UTC(2026, 9, 27) / 1000;
const END = START + 86400;
const MEMO = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
const WALLET = 'FEwxLZ64Wdh1VFP53jfA37yDVnD8gL3FgzsZNuQ6pCC9';
const options = { chain: 'solana', startTimestamp: START, endTimestamp: END } as FetchOptions;

function fixture() {
  const db = new DatabaseSync(':memory:');
  // Execute the production query with shims for Trino's scalar functions. These fixtures
  // check SQL behavior, not Dune's live schema, pricing, decoder coverage or indexing latency.
  db.function('FROM_UNIXTIME', (value: number) => value);
  db.function('from_hex', (value: string) => Buffer.from(value, 'hex'));
  db.function('from_utf8', (value: Uint8Array) => Buffer.from(value).toString('utf8'));
  db.function('element_at', (value: string, index: number) => JSON.parse(value)[index - 1] ?? null);
  db.function('cardinality', (value: string) => JSON.parse(value).length);
  db.function('regexp_like', (value: string, pattern: string) => Number(new RegExp(pattern).test(value)));
  db.function('GREATEST', { varargs: true }, (...values: number[]) => Math.max(...values));
  db.function('varbinary_length', (value: Uint8Array) => value.length);
  db.function('varbinary_substring', (value: Uint8Array, start: number, length: number) =>
    Buffer.from(value).subarray(start - 1, start - 1 + length));
  db.exec(`
    ATTACH DATABASE ':memory:' AS solana;
    ATTACH DATABASE ':memory:' AS tokens_solana;
    ATTACH DATABASE ':memory:' AS dex_solana;
    ATTACH DATABASE ':memory:' AS evms;
    ATTACH DATABASE ':memory:' AS dex_aggregator;
    ATTACH DATABASE ':memory:' AS dex;
    CREATE TABLE solana.instruction_calls (
      tx_id TEXT, account_arguments TEXT, block_time INTEGER, tx_success INTEGER,
      executing_account TEXT, data BLOB
    );
    CREATE TABLE tokens_solana.transfers (
      tx_id TEXT, from_owner TEXT, to_owner TEXT, block_time INTEGER, action TEXT, amount REAL
    );
    CREATE TABLE dex_solana.trades (
      tx_id TEXT, trader_id TEXT, outer_instruction_index INTEGER, inner_instruction_index INTEGER,
      token_sold_mint_address TEXT, token_bought_mint_address TEXT,
      token_sold_amount_raw INTEGER, token_bought_amount_raw INTEGER, amount_usd REAL, block_time INTEGER
    );
    CREATE TABLE evms.transactions (blockchain TEXT, hash TEXT, block_time INTEGER, data BLOB);
    CREATE TABLE dex_aggregator.trades (blockchain TEXT, tx_hash TEXT, block_time INTEGER, amount_usd REAL);
    CREATE TABLE dex.trades (
      blockchain TEXT, tx_hash TEXT, block_time INTEGER,
      token_bought_address TEXT, token_sold_address TEXT, amount_usd REAL
    );
  `);
  const memo = (tx: string, trader = 'alice', text = '865d8597', program = MEMO, time = START, success = 1) => {
    db.prepare('INSERT INTO solana.instruction_calls VALUES (?, ?, ?, ?, ?, ?)')
      .run(tx, JSON.stringify([trader]), time, success, program, Buffer.from(text));
  };
  const fee = (tx: string, trader = 'alice', amount = 0.5, time = START) => {
    db.prepare('INSERT INTO tokens_solana.transfers VALUES (?, ?, ?, ?, ?, ?)')
      .run(tx, trader, WALLET, time, 'transfer', amount);
  };
  const leg = (
    tx: string, sold: string, bought: string, soldRaw: number, boughtRaw: number,
    usd: number | null, inner = 0, outer = 1, trader = 'alice', time = START,
  ) => {
    db.prepare('INSERT INTO dex_solana.trades VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(tx, trader, outer, inner, sold, bought, soldRaw, boughtRaw, usd, time);
  };
  const query = (sql = solanaVolumeQuery(options)) => db.prepare(sql).all();
  return { db, memo, fee, leg, query };
}

test('uses decoded notional at any fee rate, including a memo-attributed zero-fee swap', () => {
  const f = fixture();
  try {
    for (const bps of [0, 25, 40, 50, 85]) {
      const tx = `fee-${bps}`;
      f.memo(tx);
      if (bps > 0) f.fee(tx, 'alice', 1000 * bps / 10000);
      f.leg(tx, 'A', 'B', 1000, 990, 1000);
    }
    assert.equal(f.query()[0].volume, 5000);
    assert.equal(f.query()[0].input_legs, 5, 'memo and fee evidence must not duplicate the swap');
  } finally { f.db.close(); }
});

test('fee-owner fallback covers omitted memos and does not attribute another trader in the transaction', () => {
  const f = fixture();
  try {
    f.fee('no-memo');
    f.fee('no-memo');
    f.leg('no-memo', 'A', 'B', 100, 99, 100);
    f.leg('no-memo', 'C', 'D', 900, 890, 900, 1, 2, 'bob');
    f.fee('deposit-only');
    f.fee('internal', WALLET);
    f.leg('internal', 'A', 'B', 100, 99, 100, 0, 1, WALLET);
    assert.equal(f.query()[0].volume, 100);
  } finally { f.db.close(); }
});

test('requires a successful SPL Memo with the exact ASCII tag and binds its signer to the decoded trader', () => {
  const f = fixture();
  try {
    f.memo('plain');
    f.memo('prefixed', 'alice', 'e25f2073865d8597');
    f.memo('wrong-program', 'alice', '865d8597', 'other');
    f.memo('wrong-data', 'alice', 'other-865d8597');
    f.memo('failed', 'alice', '865d8597', MEMO, START, 0);
    f.memo('other-trader', 'bob');
    for (const tx of ['plain', 'prefixed', 'wrong-program', 'wrong-data', 'failed', 'other-trader']) {
      f.leg(tx, 'A', 'B', 100, 99, 100);
    }
    assert.equal(f.query()[0].volume, 200);
  } finally { f.db.close(); }
});

test('sums split inputs, skips intermediate hops and keeps separate outer routing instructions', () => {
  const f = fixture();
  try {
    f.memo('split');
    f.leg('split', 'A', 'B', 35, 34, 35, 1);
    f.leg('split', 'B', 'D', 34, 33, 34, 2);
    f.leg('split', 'A', 'C', 65, 64, 65, 3);
    f.leg('split', 'C', 'D', 64, 63, 64, 4);
    f.leg('split', 'X', 'Y', 50, 49, 50, 1, 2);
    assert.equal(f.query()[0].volume, 150);
  } finally { f.db.close(); }
});

test('does not recount recycled entry tokens, but counts fresh input added after a cycle', () => {
  const f = fixture();
  try {
    f.memo('cycle');
    f.leg('cycle', 'A', 'B', 100, 99, 100, 1);
    f.leg('cycle', 'B', 'A', 99, 95, 99, 2);
    f.leg('cycle', 'A', 'C', 105, 104, 105, 3);
    assert.equal(f.query()[0].volume, 110);
  } finally { f.db.close(); }
});

test('uses half-open time windows for both attribution and swaps', () => {
  const f = fixture();
  try {
    for (const [tx, time] of [['before', START - 1], ['start', START], ['end', END]] as const) {
      f.memo(tx, 'alice', '865d8597', MEMO, time);
      f.leg(tx, 'A', 'B', 100, 99, 100, 0, 1, 'alice', time);
    }
    assert.equal(f.query()[0].volume, 100);
  } finally { f.db.close(); }
});

test('rejects partial pricing instead of silently publishing the priced subset', async (t) => {
  const f = fixture();
  try {
    f.memo('priced');
    f.leg('priced', 'A', 'B', 100, 99, 100);
    f.memo('unpriced');
    f.leg('unpriced', 'A', 'B', 100, 99, null);
    t.mock.method(Date, 'now', () => (END + 11 * 3600) * 1000);
    t.mock.method(dune, 'queryDuneSql', async (_options: FetchOptions, sql: string) => f.query(sql));
    assert.equal(f.query()[0].unpriced_input_legs, 1);
    await assert.rejects(fetch(options), /missing input amounts or prices/);
  } finally { f.db.close(); }
});

test('accepts a decoded empty period, but rejects missing, null, negative or nonfinite results', async (t) => {
  const f = fixture();
  try {
    t.mock.method(Date, 'now', () => (END + 11 * 3600) * 1000);
    let rows: unknown[] = f.query();
    t.mock.method(dune, 'queryDuneSql', async () => rows);
    assert.equal((await fetch(options)).dailyVolume, 0);
    for (const invalid of [undefined, null, -1, 'NaN', 'Infinity']) {
      rows = invalid === undefined ? [] : [{ volume: invalid, decoded_legs: 0, input_legs: 0, unpriced_input_legs: 0 }];
      await assert.rejects(fetch(options), /missing Dune|invalid Dune/);
    }
    rows = [{ volume: 1 }];
    await assert.rejects(fetch(options), /missing Dune/);
    rows = [{ volume: 0, decoded_legs: 1, input_legs: 0, unpriced_input_legs: 0 }];
    await assert.rejects(fetch(options), /missing input amounts or prices/);
  } finally { f.db.close(); }
});

test('enforces the Solana indexing delay and propagates warehouse failures', async (t) => {
  t.mock.method(Date, 'now', () => (END + 10 * 3600 - 1) * 1000);
  let calls = 0;
  t.mock.method(dune, 'queryDuneSql', async () => { calls++; throw new Error('warehouse failed'); });
  await assert.rejects(fetch(options), /allow 10 hours/);
  assert.equal(calls, 0);
  t.mock.method(Date, 'now', () => (END + 10 * 3600) * 1000);
  await assert.rejects(fetch(options), /warehouse failed/);
});

test('EVM attribution requires chain plus hash, while existing Robinhood hop handling is unchanged', async (t) => {
  const f = fixture();
  try {
    f.db.prepare('INSERT INTO evms.transactions VALUES (?, ?, ?, ?)')
      .run('ethereum', 'shared-hash', START, Buffer.from('1234865d8597', 'hex'));
    f.db.prepare('INSERT INTO evms.transactions VALUES (?, ?, ?, ?)')
      .run('robinhood', 'robinhood-hash', START, Buffer.from('1234865d8597', 'hex'));
    f.db.exec(`
      INSERT INTO dex_aggregator.trades VALUES ('ethereum', 'shared-hash', ${START}, 100);
      INSERT INTO dex_aggregator.trades VALUES ('base', 'shared-hash', ${START}, 900);
      INSERT INTO dex.trades VALUES ('robinhood', 'robinhood-hash', ${START}, 'B', 'A', 200);
      INSERT INTO dex.trades VALUES ('robinhood', 'robinhood-hash', ${START}, 'C', 'B', 190);
    `);
    t.mock.method(dune, 'queryDuneSql', async (_options: FetchOptions, sql: string) => f.query(sql));
    const results = await adapter.prefetch!(options) as unknown as { blockchain: string; dailyVolume: number }[];
    assert.equal(results.find(row => row.blockchain === 'ethereum')?.dailyVolume, 100);
    assert.equal(results.some((row: { blockchain: string }) => row.blockchain === 'base'), false);
    assert.equal(results.find(row => row.blockchain === 'robinhood')?.dailyVolume, 200);
    assert.equal((await fetch({ ...options, chain: 'base', preFetchedResults: results })).dailyVolume, 0);
  } finally { f.db.close(); }
});
