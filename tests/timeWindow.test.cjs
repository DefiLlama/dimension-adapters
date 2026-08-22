const assert = require('node:assert/strict');
const test = require('node:test');

const {
  getAdapterTimeWindow,
  getLogStartBlock,
} = require('../adapters/utils/timeWindow');

function assertAdjacentWindows(first, second, windowSize) {
  assert.equal(first.endTimestamp, second.startTimestamp);
  assert.equal(first.endTimestamp - first.startTimestamp, windowSize);
  assert.equal(second.endTimestamp - second.startTimestamp, windowSize);

  assert.equal(first.toTimestamp + 1, first.endTimestamp);
  assert.equal(second.fromTimestamp + 1, second.startTimestamp);
  assert.equal(first.toTimestamp, second.fromTimestamp);
}

test('daily query windows are adjacent and half-open', () => {
  const first = getAdapterTimeWindow(1_728_000_000, 86_400);
  const second = getAdapterTimeWindow(1_728_086_400, 86_400);

  assertAdjacentWindows(first, second, 86_400);
});

test('hourly query windows are adjacent and half-open', () => {
  const first = getAdapterTimeWindow(1_728_000_000, 3_600);
  const second = getAdapterTimeWindow(1_728_003_600, 3_600);

  assertAdjacentWindows(first, second, 3_600);
});

test('legacy timestamps remain inclusive state snapshots', () => {
  assert.deepEqual(getAdapterTimeWindow(86_400, 86_400), {
    startTimestamp: 0,
    endTimestamp: 86_400,
    fromTimestamp: -1,
    toTimestamp: 86_399,
  });
});

test('log ranges advance valid snapshot blocks without converting missing blocks', () => {
  assert.equal(getLogStartBlock(0), 1);
  assert.equal(getLogStartBlock(42), 43);
  assert.equal(getLogStartBlock(null), null);
  assert.equal(getLogStartBlock(undefined), undefined);
});

test('invalid windows fail before adapters execute', () => {
  assert.throws(() => getAdapterTimeWindow(10.5, 1), /endTimestamp must be an integer/);
  assert.throws(() => getAdapterTimeWindow(10, 0), /windowSize must be a positive integer/);
  assert.throws(() => getAdapterTimeWindow(10, 1.5), /windowSize must be a positive integer/);
});
