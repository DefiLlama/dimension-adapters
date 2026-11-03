import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Balances } from '@defillama/sdk';
import type { FetchOptions, FetchV2 } from '../adapters/types';
import adapter from '../fees/hedera';

const allium = require('../helpers/allium');
const fetch = adapter.fetch as FetchV2;
const options = {
  chain: 'hedera',
  dateString: '2026-10-27',
  startTimestamp: Date.UTC(2026, 9, 27) / 1000,
  endTimestamp: Date.UTC(2026, 9, 28) / 1000,
  createBalances: () => new Balances({ chain: 'hedera' }),
} as FetchOptions;

for (const [name, rows] of [
  ['an absent result', undefined],
  ['no rows', []],
  ['a null fee sum', [{ tx_fees: null }]],
  ['a missing fee sum', [{}]],
] as const) {
  test(`rejects ${name}`, async (t) => {
    t.mock.method(allium, 'queryAllium', async () => rows);
    await assert.rejects(fetch(options), /Allium returned no rows for Hedera fees on 2026-10-27/);
  });
}

for (const [txFees, expected] of [[0, 0], ['0', 0], ['250000000', 2.5]] as const) {
  test(`converts ${JSON.stringify(txFees)} tinybars to ${expected} HBAR`, async (t) => {
    t.mock.method(allium, 'queryAllium', async () => [{ tx_fees: txFees }]);
    const result = await fetch(options);
    const fees = (result.dailyFees as Balances).getBalances();
    const supplySide = (result.dailySupplySideRevenue as Balances).getBalances();

    assert.equal(Number(fees['coingecko:hedera-hashgraph'] ?? 0), expected);
    assert.deepEqual(supplySide, fees);
    assert.equal(result.dailyRevenue, 0);
  });
}
