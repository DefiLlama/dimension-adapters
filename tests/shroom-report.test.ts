import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { saveJson, validateHours, usd, sumUsd } from '../reports/shroom-history-2026-09-08/report-utils';
const expected = Array.from({ length: 144 }, (_, i) => ({ startTimestamp: i * 3600, endTimestamp: (i + 1) * 3600 }));
const valued = (value: any) => ({ breakdownByToken: { robinhood: { dailyRevenue: { usdTvl: value } } } });

test('cached coverage rejects duplicate, shifted, and out-of-range windows', () => {
  assert.equal(validateHours(expected, expected), true);
  assert.equal(validateHours([...expected].reverse(), expected), true);
  assert.equal(validateHours(expected.slice(1), expected), false);
  assert.throws(() => validateHours([...expected.slice(1), expected[1]], expected), /Duplicate/);
  assert.throws(() => validateHours([{ startTimestamp: 0, endTimestamp: 7200 }], expected), /Invalid/);
  assert.throws(() => validateHours([{ startTimestamp: -3600, endTimestamp: 0 }], expected), /Invalid/);
  assert.throws(() => validateHours([{ startTimestamp: 144 * 3600, endTimestamp: 145 * 3600 }], expected), /Invalid/);
});

test('missing valuations remain unknown and explicit zero stays zero', () => {
  assert.equal(usd({}, 'dailyRevenue'), null);
  assert.equal(usd(valued(undefined), 'dailyRevenue'), null);
  assert.equal(usd(valued(null), 'dailyRevenue'), null);
  assert.equal(usd(valued(0), 'dailyRevenue'), 0);
  assert.equal(sumUsd([valued(2), valued(0)], 'dailyRevenue'), 2);
  assert.equal(sumUsd([valued(2), {}], 'dailyRevenue'), null);
  for (const invalid of [NaN, Infinity, '0']) assert.throws(() => usd(valued(invalid), 'dailyRevenue'), /Invalid/);
});

test('failed replacement leaves the prior JSON intact and successful replacement is complete', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shroom-report-'));
  const destination = path.join(dir, 'state.json');
  try {
    saveJson(destination, { slots: [1] });
    const rename = mock.method(fs, 'renameSync', () => { throw new Error('interrupted'); });
    try { assert.throws(() => saveJson(destination, { slots: [1, 2] }), /interrupted/); }
    finally { rename.mock.restore(); }
    assert.deepEqual(JSON.parse(fs.readFileSync(destination, 'utf8')), { slots: [1] });
    assert.deepEqual(fs.readdirSync(dir), ['state.json']);
    saveJson(destination, { slots: [1, 2] });
    assert.deepEqual(JSON.parse(fs.readFileSync(destination, 'utf8')), { slots: [1, 2] });
  } finally { fs.rmSync(dir, { recursive: true }); }
});
