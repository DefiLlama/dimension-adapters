import assert from 'node:assert/strict';
import test from 'node:test';
import axios from 'axios';
import { Balances } from '@defillama/sdk';
import { FetchOptions } from '../adapters/types';
import adapter from '../fees/tickerspring-vaults';
import { managedVaults } from '../fees/tickerspring-vaults/deployments';
import { START, DAY, dailyResponse, Boundary } from '../fees/tickerspring-vaults/accounting';
const first = managedVaults[0];
const hash = (n: number) => `0x${n.toString(16).padStart(64, '0')}`;
const snapshot = (timestamp: number): Boundary => ({ timestamp, blockNumber: 62000000 + timestamp - START,
  blockTimestamp: timestamp - 1, nextBlockTimestamp: timestamp, blockHash: hash(timestamp),
  vaults: managedVaults.map(v => ({ vault: v.vault, position: v.vault, harvested: ['0', '0'], pending: ['0', '0'] })) });
const day = () => dailyResponse('2026-09-12', snapshot(START + DAY), snapshot(START + 2 * DAY));
const amount = (balance: any, token = first.token0) => Object.entries((balance as Balances).getBalances())
  .filter(([key]) => key.toLowerCase() === `robinhood:${token.toLowerCase()}`).reduce((sum, [, value]) => sum + BigInt(value as string), 0n);
async function run(data: any, dateString = '2026-09-12') {
  const original = axios.get;
  axios.get = async (url: string) => {
    assert.equal(url, `https://api.tickerspring.com/v1/public/fees/tickerspring-vaults?date=${dateString}`);
    if (data instanceof Error) throw data;
    return { status: 200, data } as any;
  };
  const noRPC = () => { throw Error('Adapter must not use RPC'); };
  try {
    return await adapter.fetch!({ dateString, chain: 'robinhood', createBalances: () => new Balances({ chain: 'robinhood' }),
      getLogs: noRPC, getFromBlock: noRPC, getToBlock: noRPC, api: { call: noRPC, multiCall: noRPC } } as unknown as FetchOptions);
  } finally { axios.get = original; }
}
function identity(result: any) {
  for (const v of managedVaults) for (const token of [v.token0, v.token1])
    assert.equal(amount(result.dailyFees, token), amount(result.dailyRevenue, token) + amount(result.dailySupplySideRevenue, token));
}
test('includes uncollected fees and applies 10/20/70 without RPC', async () => {
  const d = day(); d.closing.vaults[0].pending = ['100', '50'];
  const r = await run(d); assert.equal(amount(r.dailyFees), 100n); assert.equal(amount(r.dailyRevenue), 30n);
  assert.equal(amount(r.dailySupplySideRevenue), 70n); assert.equal(amount(r.dailyFees, first.token1), 50n);
  assert.equal(r.dailyHoldersRevenue, undefined); identity(r);
});
test('a harvest transfers pending into cumulative without creating fees', async () => {
  const d = day(); d.opening.vaults[0].pending = ['100', '200']; d.closing.vaults[0].harvested = ['100', '200'];
  const r = await run(d); assert.equal(amount(r.dailyFees), 0n); assert.equal(amount(r.dailyRevenue), 0n); identity(r);
});
test('new earnings across a harvest count only the new amount', async () => {
  const d = day(); d.opening.vaults[0].pending = ['100', '0'];
  d.closing.vaults[0].harvested = ['100', '0']; d.closing.vaults[0].pending = ['40', '0'];
  const r = await run(d); assert.equal(amount(r.dailyFees), 40n); assert.equal(amount(r.dailyRevenue), 12n); identity(r);
});
test('migration and recovery transfers preserve attribution to vault and native token', async () => {
  const d = day(); d.opening.vaults[0].pending[0] = '100'; d.closing.vaults[0].harvested[0] = '100';
  d.closing.vaults[0].position = managedVaults[1].vault; d.closing.vaults[0].pending[0] = '20';
  const r = await run(d); assert.equal(amount(r.dailyFees), 20n); identity(r);
});
test('stock prices, deposits and principal are not part of fee accounting', async () => {
  const d: any = day(); d.closing.assets = '999999999999999999999999999'; d.closing.price = 999999;
  const r = await run(d); assert.equal(amount(r.dailyFees), 0n); identity(r);
});
test('V3 and V4 venue vaults both accrue and shared-token balances add correctly', async () => {
  const d = day(); d.closing.vaults[0].pending[1] = '100'; d.closing.vaults[1].pending[0] = '200';
  const r = await run(d); assert.equal(amount(r.dailyFees, first.token1), 300n); identity(r);
});
test('cumulative allocation rounding telescopes across adjacent days', async () => {
  const a = snapshot(START + DAY), b = snapshot(START + 2 * DAY), c = snapshot(START + 3 * DAY);
  a.vaults[0].pending[0] = '9'; b.vaults[0].pending[0] = '11'; c.vaults[0].pending[0] = '23';
  const x = await run(dailyResponse('2026-09-12', a, b));
  const y = await run(dailyResponse('2026-09-13', b, c), '2026-09-13');
  assert.equal(amount(x.dailyFees) + amount(y.dailyFees), 14n);
  assert.equal(amount(x.dailyRevenue) + amount(y.dailyRevenue), (23n / 10n - 9n / 10n) + (23n / 5n - 9n / 5n));
  identity(x); identity(y);
});
test('pending rounding dust is preserved, not silently clamped or inflated', async () => {
  const d = day(); d.opening.vaults[0].pending[0] = '10'; d.closing.vaults[0].pending[0] = '9';
  const r = await run(d); assert.equal(amount(r.dailyFees), -1n); identity(r); assert.equal(adapter.allowNegativeValue, true);
});
test('first-day opening explicitly represents not-yet-deployed vaults', async () => {
  const a = snapshot(START), b = snapshot(START + DAY); a.blockNumber = 60000000;
  for (const row of a.vaults) row.position = null;
  b.vaults[0].pending[0] = '100';
  const r = await run(dailyResponse('2026-09-11', a, b), '2026-09-11'); assert.equal(amount(r.dailyFees), 100n);
});
test('wrong day, chain, version, missing vaults or duplicated vaults fail loudly', async () => {
  const mutations = [
    (d: any) => d.date = '2026-09-13', (d: any) => d.chain = 'ethereum', (d: any) => d.version = 2,
    (d: any) => d.closing.vaults.pop(), (d: any) => d.closing.vaults[1] = d.closing.vaults[0],
    (d: any) => d.closing.timestamp += 1, (d: any) => d.opening = null,
  ];
  for (const mutate of mutations) { const d = day(); mutate(d); await assert.rejects(run(d)); }
});
test('invalid blocks, raw amounts, counter resets and predeployment fees fail', async () => {
  const mutations = [
    (d: any) => d.closing.blockNumber = null, (d: any) => d.closing.blockNumber = d.opening.blockNumber - 1,
    (d: any) => d.closing.blockHash = 'bad', (d: any) => d.closing.blockTimestamp = d.closing.timestamp,
    (d: any) => d.closing.vaults[0].pending[0] = '-1', (d: any) => d.closing.vaults[0].pending[0] = 1,
    (d: any) => d.closing.vaults[0].pending[0] = 'NaN', (d: any) => d.opening.vaults[0].harvested[0] = '100',
    (d: any) => { d.opening.blockNumber = 1; d.opening.vaults[0].pending[0] = '100'; },
  ];
  for (const mutate of mutations) { const d = day(); mutate(d); await assert.rejects(run(d)); }
});
test('API outages and missing history never become zero-fee days', async () => {
  await assert.rejects(run(new Error('Fee history is not available')), /Fee history is not available/);
});
test('only the 18 V7 vaults and completed daily reporting are configured', () => {
  assert.equal(managedVaults.length, 18); assert.equal(new Set(managedVaults.map(v => v.vault.toLowerCase())).size, 18);
  assert.equal(adapter.version, 1); assert.equal(adapter.pullHourly, undefined); assert.equal(adapter.start, '2026-09-11');
});
