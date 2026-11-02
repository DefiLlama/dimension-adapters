import assert from 'node:assert/strict';
import { test, TestContext } from 'node:test';
import { Balances } from '@defillama/sdk';
import type { FetchOptions, FetchV2 } from '../adapters/types';
import { fees, getAdapter, protocolList } from '../factory/injectiveBigQuery';

const fetchURL = require('../utils/fetchURL');
const date = '2026-10-20';
const midnight = Date.parse(`${date}T00:00:00Z`);
const hours48 = 48 * 60 * 60 * 1000;

function fixture(t: TestContext, response: unknown, now = midnight + hours48 + 1) {
  const requests: string[] = [];
  t.mock.method(Date, 'now', () => now);
  t.mock.method(fetchURL, 'httpGet', async (url: string) => {
    requests.push(url);
    if (url.includes('/tc/summary')) return [{ volume: '123' }];
    if (response instanceof Error) throw response;
    return response;
  });
  const options = {
    dateString: date,
    createBalances: () => new Balances({ chain: 'injective' }),
  } as FetchOptions;
  return { options, requests };
}

// Shape verified against the public BigQuery volume and fee endpoints.
function dailyResponse(rowDate: string, amount = 42) {
  return {
    days: [{ date: rowDate, volume_usd: amount, exchange_fees_usd: amount }],
    total_volume_usd: amount,
    exchange_fees_usd: amount,
  };
}

for (const slug of protocolList) {
  const fetch = getAdapter(slug)!.fetch as FetchV2;
  test(`${slug}: rejects a single row for another day`, async (t) => {
    const { options, requests } = fixture(t, dailyResponse('2026-10-19'));
    await assert.rejects(fetch(options), /No data found for the given date/);
    assert.equal(requests.length, 1);
  });
  test(`${slug}: preserves matching historical data, including zero`, async (t) => {
    const { options, requests } = fixture(t, dailyResponse(date, 0));
    assert.deepEqual(await fetch(options), { dailyVolume: 0 });
    assert.equal(requests.length, 1);
  });
}

for (const slug of fees.protocolList) {
  const fetch = fees.getAdapter(slug)!.fetch as FetchV2;
  test(`${slug} fees: rejects a single row for another day`, async (t) => {
    const { options } = fixture(t, dailyResponse('2026-10-19'));
    await assert.rejects(fetch(options), /No data found for the given date/);
  });
  test(`${slug} fees: preserves matching data and revenue attribution`, async (t) => {
    const { options, requests } = fixture(t, dailyResponse(date));
    const result = await fetch(options);
    assert.equal(await (result.dailyFees as Balances).getUSDValue(), 42);
    assert.equal(await (result.dailyRevenue as Balances).getUSDValue(), 42);
    assert.equal(await (result.dailyHoldersRevenue as Balances).getUSDValue(), 42);
    assert.equal(requests.length, 1);
  });
}

for (const slug of ['injective-spot', 'injective-derivatives']) {
  const fetch = getAdapter(slug)!.fetch as FetchV2;
  for (const [label, age, allowed] of [
    ['future date', -1, false],
    ['current midnight', 0, true],
    ['just inside 48 hours', hours48 - 1, true],
    ['exactly 48 hours', hours48, true],
    ['older than 48 hours', hours48 + 1, false],
  ] as const) {
    test(`${slug}: fallback for ${label}`, async (t) => {
      const { options, requests } = fixture(t, { days: [] }, midnight + age);
      if (allowed) {
        assert.deepEqual(await fetch(options), { dailyVolume: 123 });
        assert.equal(requests.length, 2);
      } else {
        await assert.rejects(fetch(options), /No data found for the given date/);
        assert.equal(requests.length, 1, 'must not query live cache');
      }
    });
  }
  test(`${slug}: retains recent fallback after a wrong-day response`, async (t) => {
    const { options } = fixture(t, dailyResponse('2026-10-19'), midnight);
    assert.deepEqual(await fetch(options), { dailyVolume: 123 });
  });
  test(`${slug}: retains recent fallback after a network failure`, async (t) => {
    const { options } = fixture(t, new Error('upstream unavailable'), midnight);
    assert.deepEqual(await fetch(options), { dailyVolume: 123 });
  });
}

for (const days of [undefined, [], [null], [{}], [{ date }, { date }]]) {
  test(`rejects malformed or non-single-day rows: ${JSON.stringify(days)}`, async (t) => {
    const { options } = fixture(t, { days, total_volume_usd: 42, exchange_fees_usd: 42 });
    await assert.rejects((getAdapter('helix-helix')!.fetch as FetchV2)(options), /No data found/);
    await assert.rejects((fees.getAdapter('helix-helix')!.fetch as FetchV2)(options), /No data found/);
  });
}
