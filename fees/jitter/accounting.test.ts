import assert from 'node:assert/strict';
import { test } from 'node:test';
import BigNumber from 'bignumber.js';
import { chains } from '@defillama/sdk';
import { feeAmounts, pointFeeAmount, readEvents, swapIndex, JitterEvent } from './index';

const q = 1n << 64n;
const event = (json: Record<string, string>, sequenceNumber = 10, digest = 'tx'): JitterEvent =>
  ({ contents: { json }, sequenceNumber, transaction: { digest } });

test('same-PTB fees use the preceding rate, not timestamp or a future/foreign price', () => {
  const swap = event({ market_state_id: 'a', fee: '100', reserve_fee: '30' });
  const rates = [event({ market_id: 'a', sy_index: String(2n*q) }, 5),
    event({ market_id: 'a', sy_index: String(3n*q) }, 9),
    event({ market_id: 'a', sy_index: String(9n*q) }, 11),
    event({ market_id: 'b', sy_index: String(8n*q) }, 9),
    event({ market_id: 'a', sy_index: String(7n*q) }, 9, 'other')];
  const amounts = feeAmounts(swap, 'swap', swapIndex(swap, rates));
  assert.equal(amounts.gross.toFixed(), '300');
  assert.equal(amounts.protocol.toFixed(), '90');
  assert.equal(amounts.supply.toFixed(), '210');
});

test('yield raw counters require TWO Q64 divisions and preserve fractions', () => {
  const amounts = feeAmounts(event({ user_interest_raw: String(19n*q), treasury_interest_raw: String(q), py_index_raw: String(2n*q) }), 'yield');
  assert.equal(amounts.gross.toFixed(), '40');
  assert.equal(amounts.protocol.toFixed(), '2');
  assert.equal(amounts.supply.toFixed(), '38');
  const fractional = feeAmounts(event({ user_interest_raw: String(q/2n), treasury_interest_raw: '0', py_index_raw: String(q) }), 'yield');
  assert.equal(fractional.gross.toFixed(), '0.5');
});

test('invalid, missing, future-only and inconsistent fees fail instead of becoming zero', () => {
  const swap = event({ market_state_id: 'a', fee: '10', reserve_fee: '11' });
  assert.throws(() => feeAmounts(swap, 'swap', new BigNumber(q.toString())));
  assert.throws(() => swapIndex(swap, []));
  assert.throws(() => swapIndex(swap, [event({ market_id: 'a', sy_index: String(q) }, 11)]));
  assert.throws(() => feeAmounts(event({ fee: '-1', reserve_fee: '0' }), 'swap', new BigNumber(1)));
  assert.throws(() => feeAmounts(event({ user_interest_raw: 'NaN', treasury_interest_raw: '0', py_index_raw: String(q) }), 'yield'));
});

test('large u64/u128 amounts retain precision and the fee allocation identity', () => {
  const amounts = feeAmounts(event({ fee: String((1n<<64n)-1n), reserve_fee: '123456789' }), 'swap', new BigNumber(q.toString()));
  assert.equal(amounts.gross.toFixed(), String((1n<<64n)-1n));
  assert(amounts.protocol.plus(amounts.supply).eq(amounts.gross));
});

test('only actual fees on the Jitter Points book count, not other projects or trade proceeds', () => {
  const json = { orderbook_id: '0x3deb69e0b256375f8805a392b9258c5236ad8cc028b8789e2d2240b24636dd1d', quote: 'dba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC', gross_quote_amount: '60600', fee_amount: '600' };
  assert.equal(pointFeeAmount(event(json))?.toFixed(), '600');
  assert.equal(pointFeeAmount(event({ ...json, orderbook_id: 'foreign' })), null);
  assert.throws(() => pointFeeAmount(event({ ...json, fee_amount: '60601' })));
  assert.throws(() => pointFeeAmount(event({ ...json, quote: '0x2::sui::SUI' })));
});

test('pagination preserves the half-open UTC window and event sequence', async () => {
  const original = chains.sui.graphqlCall;
  const calls: unknown[] = [];
  chains.sui.graphqlCall = async (options: any) => {
    calls.push(options.variables.before);
    const times = calls.length === 1 ? [150, 199, 200] : [90, 100];
    return { events: { nodes: times.map(t => ({ ...event({}, t), timestamp: new Date(t*1000).toISOString() })),
      pageInfo: { hasPreviousPage: calls.length === 1, startCursor: calls.length === 1 ? 'page-2' : null } } };
  };
  try {
    assert.deepEqual((await readEvents('test::event', { startTimestamp: 100, endTimestamp: 200 })).map(e => e.sequenceNumber), [100,150,199]);
    assert.deepEqual(calls, [null,'page-2']);
  } finally { chains.sui.graphqlCall = original; }
});
