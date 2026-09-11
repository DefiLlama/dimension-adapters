import assert from 'node:assert/strict';
import { test } from 'node:test';
import runAdapter from '../adapters/utils/runAdapter';
import { SimpleAdapter } from '../adapters/types';

const start = Date.parse('2026-09-05T00:00:00Z') / 1000;

async function fetchedWindows(version: number, windowSize: number, ends: number[]) {
  const windows: number[][] = [];
  const module: SimpleAdapter = {
    version, pullHourly: version === 2, chains: ['off_chain'], start: '2026-09-05',
    fetch: async options => {
      windows.push([options.startTimestamp, options.endTimestamp]);
      return { dailyVolume: 1 };
    },
  };
  for (const endTimestamp of ends)
    await runAdapter({ module, endTimestamp, runWindowInSeconds: windowSize });
  return windows;
}

test('all 24 hours of the first day run; pre-start hour does not', async () => {
  const windows = await fetchedWindows(2, 3600, Array.from({ length: 25 }, (_, i) => start + i * 3600));
  assert.equal(windows.length, 24);
  assert.equal(windows[0][1], start + 3600);
  assert.equal(windows[23][1], start + 24 * 3600);
});

test('daily v1 and v2 keep their original first-day boundary', async () => {
  for (const version of [1, 2]) {
    const windows = await fetchedWindows(version, 86400, [start, start + 86400]);
    assert.equal(windows.length, 1);
    assert.equal(windows[0][1], start + 86400);
  }
});
