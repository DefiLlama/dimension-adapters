import assert from 'node:assert/strict';
import { after, before, mock, test } from 'node:test';
import * as sdk from '@defillama/sdk';
import type { FetchOptions, SimpleAdapter } from '../adapters/types';
import runAdapter from '../adapters/utils/runAdapter';

const windowEnd = Date.UTC(2026, 9, 29, 6) / 1000;

before(() => {
  mock.method(sdk.callStats, 'run', async (_metadata: unknown, execute: () => Promise<unknown>) => execute());
  mock.method(sdk.elastic, 'addRuntimeLog', async () => undefined);
  mock.method(sdk.elastic, 'addErrorLog', async () => undefined);
});

after(() => mock.restoreAll());

async function captureWindow(endTimestamp: number, runWindowInSeconds?: number, version: 1 | 2 = 2) {
  let captured: FetchOptions | undefined;
  let prefetched: FetchOptions | undefined;
  const module: SimpleAdapter = {
    version,
    chains: ['derive_v3'],
    start: '2026-10-06',
    prefetch: async options => { prefetched = options; return {}; },
    fetch: async options => {
      captured = options;
      return { dailyNotionalVolume: 1, dailyPremiumVolume: 1 };
    },
  };
  const response = await runAdapter({ module, endTimestamp, runWindowInSeconds });
  assert.ok(captured);
  assert.ok(prefetched);
  return { captured, prefetched, response };
}

for (const seconds of [3600, 86400, 900]) {
  test(`uses an exact ${seconds}-second half-open timestamp window`, async () => {
    const { captured, prefetched, response } = await captureWindow(windowEnd, seconds);
    assert.equal(captured.startTimestamp, windowEnd - seconds);
    assert.equal(captured.endTimestamp, windowEnd);
    assert.equal(captured.fromTimestamp, windowEnd - seconds);
    assert.equal(captured.toTimestamp, windowEnd - 1);
    assert.equal(captured.endTimestamp - captured.startTimestamp, seconds);
    assert.equal(prefetched.startTimestamp, captured.startTimestamp);
    assert.equal(prefetched.endTimestamp, captured.endTimestamp);
    assert.equal(response[0].timestamp, windowEnd - 1);
  });
}

test('adjacent hours count subsecond boundary trades exactly once', async () => {
  const previous = (await captureWindow(windowEnd, 3600)).captured;
  const next = (await captureWindow(windowEnd + 3600, 3600)).captured;
  const trades = [windowEnd * 1000 - 1001, windowEnd * 1000 - 1000, windowEnd * 1000 - 389, windowEnd * 1000];
  const occurrences = trades.map(timestamp => [previous, next].filter(options =>
    timestamp >= options.startTimestamp * 1000 && timestamp < options.endTimestamp * 1000).length);
  assert.deepEqual(occurrences, [1, 1, 1, 1]);
  assert.equal(previous.endTimestamp, next.startTimestamp);
});

test('default daily windows do not include the preceding day final second', async () => {
  const { captured } = await captureWindow(windowEnd);
  assert.equal(captured.startTimestamp, windowEnd - 86400);
  assert.equal(captured.endTimestamp, windowEnd);
});

test('legacy version-one options retain a one-day window and inclusive final second', async () => {
  const { captured } = await captureWindow(windowEnd, undefined, 1);
  assert.equal(captured.fromTimestamp, windowEnd - 86400);
  assert.equal(captured.toTimestamp, windowEnd - 1);
});
