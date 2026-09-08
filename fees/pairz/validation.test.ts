// Offline regression tests. These never execute Dune or prove real fee totals.
// Run: npx ts-node --transpile-only fees/pairz/validation.test.ts
import assert from 'node:assert/strict';
import { aggregateFees, feeQuery } from './index';
import adapter from './index';
import { FetchOptions } from '../../adapters/types';

const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const STOCK = 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp';
class Balances {
  entries: { mint: string; amount: bigint; label: string }[] = [];
  add(mint: string, value: string, label: string) { this.entries.push({ mint, amount: BigInt(value), label }); }
  sum() { return this.entries.reduce((total, entry) => total + entry.amount, 0n); }
}
const options = { createBalances: () => new Balances() } as unknown as FetchOptions;
const row = { quote_mint: USDC, platform_fee: '9007199254740993', protocol_fee: '50', creator_fee: '7', trade_count: 1, invalid_rows: 0, migration_count: 0 };
const empty = { quote_mint: null, platform_fee: null, protocol_fee: null, creator_fee: null, trade_count: null, invalid_rows: null, migration_count: 0 };
let checks = 0;
const test = (name: string, run: () => void) => { run(); checks++; console.log(`PASS ${name}`); };
const get = (rows: unknown) => aggregateFees(options, rows) as unknown as Record<string, Balances>;
test('exact integer accounting and correct quote mints', () => {
  const d = get([row, { ...row, quote_mint: STOCK, platform_fee: '100' }]);
  assert.equal(d.dailyFees.sum(), d.dailyRevenue.sum() + d.dailySupplySideRevenue.sum());
  assert.equal(d.dailyRevenue.sum(), 9007199254741093n);
  assert.deepEqual(d.dailyRevenue.entries.map(e => e.mint), [USDC, STOCK]);
  assert.equal(d.dailyHoldersRevenue, undefined);
  for (const [field, metric] of [['dailyFees', 'Fees'], ['dailyRevenue', 'Revenue'], ['dailySupplySideRevenue', 'SupplySideRevenue']])
    for (const entry of d[field].entries) assert.ok((adapter.breakdownMethodology as any)[metric][entry.label]);
});
test('verified empty-query shape returns zero', () => assert.equal(get([empty]).dailyFees.sum(), 0n));
test('zero fee trades are valid', () => assert.equal(get([{...row,platform_fee:'0',protocol_fee:'0',creator_fee:'0'}]).dailyFees.sum(),0n));
for (const [name, rows] of [
  ['empty provider result', []], ['null provider result', null], ['null row', [null]],
  ['migration coverage gap', [{...row,migration_count:1}]],
  ['missing migration evidence', [{...row,migration_count:undefined}]],
  ['invalid decoded rows', [{...row,invalid_rows:1}]],
  ['missing trade count', [{...row,trade_count:undefined}]],
  ['zero trade count with fees', [{...row,trade_count:0}]],
  ['unsafe numeric amount', [{...row,platform_fee:9007199254740992}]],
  ['negative amount', [{...row,platform_fee:'-1'}]],
  ['fractional amount', [{...row,platform_fee:'1.1'}]],
  ['scientific notation', [{...row,platform_fee:'1e9'}]],
  ['oversized decimal', [{...row,platform_fee:'1'.repeat(39)}]],
  ['missing amount', [{...row,protocol_fee:null}]],
  ['invalid mint', [{...row,quote_mint:'USDC'}]],
  ['duplicate quote aggregate', [row,row]],
  ['partial sentinel with hidden fees', [{...empty,platform_fee:'100'}]],
  ['sentinel mixed with trades', [empty,row]],
] as const) test(name, () => assert.throws(() => get(rows)));
test('query uses successful txs and half-open intervals', () => {
  const sql=feeQuery({startTimestamp:100,endTimestamp:200});
  assert.match(sql,/tx.success AND TIME_RANGE/);
  assert.match(sql,/>= from_unixtime\(100\)/);
  assert.match(sql,/< from_unixtime\(200\)/);
  assert.ok(!sql.includes('UNION ALL'));
  assert.match(sql,/p.null_quotes > 0/);
});
for (const window of [{startTimestamp:200,endTimestamp:100},{startTimestamp:0,endTimestamp:0},{startTimestamp:-1,endTimestamp:1},{startTimestamp:0,endTimestamp:NaN}])
  test('reject invalid query window '+JSON.stringify(window),()=>assert.throws(()=>feeQuery(window)));
console.log(`${checks} offline checks passed; live SQL, data coverage and chain reconciliation remain unverified.`);
