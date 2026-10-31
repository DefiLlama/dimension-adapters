import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventFragment, Interface } from 'ethers';
import { ChainApi } from '@defillama/sdk';
import { products, events, withdrawalFees, managerFromReceipt, stexAdapter, windowBounds } from '../helpers/valantis';
import { rebaseAmounts } from '../fees/valantis-sthype';
import restaking from '../fees/valantis-sthype-restaking';

const product = products.sthype;
const moduleAddress = '0x0000000000000000000000000000000000000010';
const sender = '0x0000000000000000000000000000000000000020';
const recipient = '0x0000000000000000000000000000000000000030';
const zero = '0x0000000000000000000000000000000000000000';
const eventInterface = new Interface(Object.values(events));
function log(name: string, address: string, values: any[], index: number) {
  return { ...eventInterface.encodeEventLog(eventInterface.getEvent(name)!, values), address, index, blockNumber: 2000000, transactionHash: '0xfixture' };
}

test('receipt-derived spread is conservative with a proven integer rounding bound', () => {
  for (const rate of [1n, 1000n, 2000n, 3000n, 9999n, 10000n]) {
    for (let actual = 0n; actual < 2000n; actual++) {
      const manager = actual * rate / 10000n;
      const amounts = withdrawalFees(manager, rate);
      assert.equal(amounts.revenue, manager);
      assert.equal(amounts.fees, amounts.revenue + amounts.supplySide);
      assert.equal(amounts.fees * rate / 10000n, manager);
      assert.ok(amounts.fees <= actual);
      assert.ok(actual - amounts.fees <= (10000n + rate - 1n) / rate - 1n);
    }
  }
  // Previously traced production execution: true spread 18390124852 wei.
  assert.equal(withdrawalFees(3678024970n, 2000n).fees, 18390124850n);
  assert.deepEqual(withdrawalFees(0n, 2000n), { fees: 0n, revenue: 0n, supplySide: 0n });
});

test('unknown zero-manager periods and invalid rates are not fabricated as zero fees', () => {
  assert.throws(() => withdrawalFees(0n, 0n), /Cannot reconstruct/);
  assert.throws(() => withdrawalFees(1n, 0n), /Cannot reconstruct/);
  assert.throws(() => withdrawalFees(1n, 10001n), /Cannot reconstruct/);
  assert.throws(() => withdrawalFees(-1n, 2000n), /Cannot reconstruct/);
});

test('receipt recovers exact manager fee from pool and requested lending amounts', () => {
  const withdrawal = log('Withdraw', product.stex, [sender, recipient, 0, 300, 1], 4);
  const logs = [log('Transfer', product.stex, [sender, zero, 1], 1),
    log('WithdrawLiquidity', product.pool, [product.stex, 0, 252], 2),
    log('AmountWithdrawnFromLendingModule', moduleAddress, [50], 3), withdrawal];
  assert.equal(managerFromReceipt(logs, withdrawal, product, moduleAddress), 2n);
  // A later withdrawal of the same share quantity is a separate invocation.
  const second = log('Withdraw', product.stex, [sender, recipient, 0, 900, 1], 7);
  logs.push(log('Transfer', product.stex, [sender, zero, 1], 5), log('WithdrawLiquidity', product.pool, [product.stex, 0, 902], 6), second);
  assert.equal(managerFromReceipt(logs, second, product, moduleAddress), 2n);
  assert.equal(managerFromReceipt(logs, withdrawal, product, moduleAddress), 2n);
  assert.throws(() => managerFromReceipt([], withdrawal, product, moduleAddress));
  const missingBurn = log('Withdraw', product.stex, [sender, recipient, 0, 0, 1], 8);
  assert.throws(() => managerFromReceipt([...logs, missingBurn], missingBurn, product, moduleAddress), /matching LP burn/);
});

test('receipt cannot count unrelated transfers or reconcile a missing funding leg', () => {
  const withdrawal = log('Withdraw', product.stex, [sender, recipient, 0, 300, 1], 4);
  const logs = [log('Transfer', product.stex, [sender, zero, 1], 1),
    log('WithdrawLiquidity', product.pool, [recipient, 0, 10000], 2), withdrawal];
  assert.throws(() => managerFromReceipt(logs, withdrawal, product, moduleAddress));
});

test('stHYPE positive rewards, changing fee rates, losses and invalid rates', () => {
  assert.deepEqual(rebaseAmounts(100n, 190n, 1000n), { gross: 100n, net: 90n, revenue: 10n });
  assert.equal(rebaseAmounts(100n, 190n, 2000n).revenue, 22n);
  assert.deepEqual(rebaseAmounts(100n, 90n, 1000n), { gross: -10n, net: -10n, revenue: 0n });
  assert.throws(() => rebaseAmounts(100n, 190n, 10000n));
});

class TestBalances {
  total = 0n;
  add(_token: string, amount: string) { this.total += BigInt(amount); }
  addGasToken(amount: string) { this.total += BigInt(amount); }
  clone() { const copy = new TestBalances(); copy.total = this.total; return copy; }
}
function options(getLogs: (args: any) => Promise<any[]>) {
  return { chain: 'hyperliquid', fromTimestamp: 999, toTimestamp: 2999, startTimestamp: 999, endTimestamp: 3000,
    getFromBlock: async () => 2000000, getToBlock: async () => 2000002,
    api: { provider: { getBlock: async (block: number) => ({ timestamp: block === 2000000 ? 999 : 2999 }) } },
    createBalances: () => new TestBalances(), getLogs } as any;
}

test('half-open boundary filtering excludes the prior second and includes closing block', async () => {
  const bounds = await windowBounds(options(async () => []));
  assert.equal(bounds.includes({ blockNumber: 2000000 }), false);
  assert.equal(bounds.includes({ blockNumber: 2000001 }), true);
  assert.equal(bounds.includes({ blockNumber: 2000002 }), true);
});

test('adjacent hourly slots count their shared boundary second exactly once', async () => {
  const prior = options(async () => []), next = options(async () => []);
  Object.assign(next, { fromTimestamp: 2999, toTimestamp: 4999, startTimestamp: 2999, endTimestamp: 5000,
    getFromBlock: async () => 2000002, getToBlock: async () => 2000004,
    api: { provider: { getBlock: async (block: number) => ({ timestamp: block === 2000002 ? 2999 : 4999 }) } } });
  const log = { blockNumber: 2000002 };
  assert.equal((await windowBounds(prior)).includes(log), true);
  assert.equal((await windowBounds(next)).includes(log), false);
  assert.equal((await windowBounds(next)).includes({ blockNumber: 2000004 }), true);
  const invalid = options(async () => []);
  invalid.getFromBlock = async () => null;
  await assert.rejects(windowBounds(invalid), /Invalid Valantis window blocks/);
});

test('same-block manager changes apply in log order, volume has only one gross leg', async (t) => {
  t.mock.method(ChainApi.prototype, 'call', async () => '1000');
  const swap = (index: number) => ({ index, blockNumber: 2000001, args: { amountIn: '1000', amountOut: '900', fee: '100', isZeroToOne: true } });
  const input = options(async ({ eventAbi }) => eventAbi === events.swap ? [swap(1), swap(3)] : eventAbi === events.managerFee
    ? [{ index: 2, blockNumber: 2000001, args: { poolManagerFeeBips: '2000' } }] : []);
  const result = await stexAdapter(product).fetch!(input) as any;
  assert.equal(result.dailyVolume.total, 2000n);
  assert.equal(result.dailyFees.total, 200n);
  assert.equal(result.dailyRevenue.total, 30n);
  assert.equal(result.dailySupplySideRevenue.total, 170n);
  assert.notEqual(result.dailyRevenue, result.dailyProtocolRevenue);
});

test('restaking counts new HYPE funding, never rescheduled old shares', async () => {
  const input = options(async () => [{ blockNumber: 2000001, args: { amountHype: '5', scheduledRawShares: '999999999999' } }]);
  const result = await restaking.fetch!(input) as any;
  assert.equal(result.dailyFees.total, 5n);
  assert.equal(result.dailySupplySideRevenue.total, 5n);
  assert.equal(result.dailyRevenue.total, 0n);
});

test('batched withdrawals need one receipt, replay module/rate changes, and never trace', async (t) => {
  t.mock.method(ChainApi.prototype, 'call', async ({ abi, skipCache }: any) => {
    if (abi === 'address:withdrawalModule') { assert.equal(skipCache, true); return moduleAddress; }
    return '2000';
  });
  const newModule = '0x0000000000000000000000000000000000000040';
  const first = log('Withdraw', product.stex, [sender, recipient, 0, 100, 1], 3);
  const second = log('Withdraw', product.stex, [sender, recipient, 0, 200, 1], 8);
  const logs = [log('Transfer', product.stex, [sender, zero, 1], 1),
    log('WithdrawLiquidity', product.pool, [product.stex, 0, 102], 2), first,
    log('PoolManagerFeeSet', product.pool, [4000], 4), log('WithdrawalModuleSet', product.stex, [newModule], 5),
    log('Transfer', product.stex, [sender, zero, 1], 6),
    log('AmountWithdrawnFromLendingModule', newModule, [204], 7), second];
  // Mix RPC hex and SDK numeric log indices.
  logs.forEach(l => { l.blockNumber = 2000001; });
  let receipts = 0;
  const input = options(async ({ eventAbi }) => logs.filter(l => l.topics[0] === EventFragment.from(eventAbi).topicHash)
    .map(l => ({ ...l, args: eventInterface.parseLog(l)!.args })));
  input.api.getTransactionReceipt = async () => { receipts++; return { status: 1, logs: logs.map(l => ({ ...l, logIndex: `0x${l.index.toString(16)}` })) }; };
  input.api.provider.send = async () => { throw new Error('Tracing is not available'); };
  const result = await stexAdapter(product).fetch!(input) as any;
  assert.equal(result.dailyFees.total, 20n);
  assert.equal(result.dailyRevenue.total, 6n);
  assert.equal(result.dailySupplySideRevenue.total, 14n);
  assert.equal(result.dailyVolume.total, 0n);
  assert.equal(receipts, 1);
  input.api.getTransactionReceipt = async () => ({ status: 1, logs: logs.filter(l => l !== first) });
  await assert.rejects(stexAdapter(product).fetch!(input), /does not match receipt/);
  input.api.getTransactionReceipt = async () => null;
  await assert.rejects(stexAdapter(product).fetch!(input), /Missing successful STEX receipt/);
});

test('zero-payout-token0 ordinary exits produce no fees', async (t) => {
  t.mock.method(ChainApi.prototype, 'call', async ({ abi }: any) => abi === 'address:withdrawalModule' ? moduleAddress : '2000');
  const withdrawal = log('Withdraw', product.stex, [sender, recipient, 0, 100, 1], 3);
  const logs = [log('Transfer', product.stex, [sender, zero, 1], 1),
    log('WithdrawLiquidity', product.pool, [product.stex, 0, 100], 2), withdrawal];
  logs.forEach(l => { l.blockNumber = 2000001; });
  const input = options(async ({ eventAbi }) => eventAbi === events.withdraw ? [{ ...withdrawal, args: eventInterface.parseLog(withdrawal)!.args }] : []);
  input.api.getTransactionReceipt = async () => ({ status: 1, logs });
  const result = await stexAdapter(product).fetch!(input) as any;
  assert.equal(result.dailyFees.total, 0n);
  assert.equal(result.dailyRevenue.total, 0n);
});

test('verified HYPE-only launch exits are exempt, later zero-share periods fail explicitly', async (t) => {
  t.mock.method(ChainApi.prototype, 'call', async ({ abi }: any) => abi === 'address:withdrawalModule' ? moduleAddress : '0');
  for (const [product, block, allowed] of [[products.khype, 8037281, true], [products.khype, 8134101, false]] as const) {
    const withdrawal = log('Withdraw', product.stex, [sender, recipient, 0, 100, 1], 3);
    const logs = [log('Transfer', product.stex, [sender, zero, 1], 1),
      log('WithdrawLiquidity', product.pool, [product.stex, 0, 100], 2), withdrawal];
    logs.forEach(l => { l.blockNumber = block; });
    const input = options(async ({ eventAbi }) => eventAbi === events.withdraw ? [{ ...withdrawal, args: eventInterface.parseLog(withdrawal)!.args }] : []);
    input.getFromBlock = async () => block - 1;
    input.getToBlock = async () => block + 1;
    input.api.provider.getBlock = async (number: number) => ({ timestamp: number === block - 1 ? 999 : 2999 });
    input.api.getTransactionReceipt = async () => ({ status: 1, logs });
    if (allowed) assert.equal((await stexAdapter(product).fetch!(input) as any).dailyFees.total, 0n);
    else await assert.rejects(stexAdapter(product).fetch!(input), /Cannot reconstruct/);
  }
});
