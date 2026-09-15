import assert from 'node:assert/strict';
import test from 'node:test';
import axios from 'axios';
import { FetchOptions } from '../adapters/types';
import adapter from '../active-users/shield-swap';

const NOW = Date.parse('2026-09-16T12:00:00Z');

function options(dateString: string): FetchOptions {
  return {
    dateString,
    startOfDay: Date.parse(`${dateString}T00:00:00Z`) / 1000,
  } as FetchOptions;
}

test('distinguishes populated, empty historical, and unpublished transaction days', async () => {
  const originalGet = axios.get;
  const originalNow = Date.now;
  const days = [
    { day: '2026-09-13T00:00:00.000Z', calls: 271 },
    { day: '2026-09-15T00:00:00.000Z', calls: 644 },
  ];

  axios.get = (async () => ({ status: 200, data: days })) as typeof axios.get;
  Date.now = () => NOW;

  try {
    const fetch = adapter.fetch as (options: FetchOptions) => Promise<{ dailyTransactionsCount: number }>;

    assert.deepEqual(await fetch(options('2026-09-15')), { dailyTransactionsCount: 644 });
    assert.deepEqual(await fetch(options('2026-09-14')), { dailyTransactionsCount: 0 });
    await assert.rejects(fetch(options('2026-09-16')), /shield-swap: metrics for 2026-09-16 are not available yet/);
  } finally {
    axios.get = originalGet;
    Date.now = originalNow;
  }
});
