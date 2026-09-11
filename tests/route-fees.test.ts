import assert from 'node:assert/strict';
import { test } from 'node:test';
import adapter from '../fees/route';
import { FetchOptions } from '../adapters/types';
import { feePaid, settled } from '../helpers/aggregators/route';

class Balance {
  values: Record<string, bigint> = {};
  add(token: string, amount: string, label: string) {
    const key = `${token.toLowerCase()}:${label}`;
    this.values[key] = (this.values[key] ?? 0n) + BigInt(amount);
  }
  addGasToken(amount: string, label: string) { this.add('native', amount, label); }
  clone() { const copy = new Balance(); copy.values = { ...this.values }; return copy; }
}

const manager = '0xda5790345fd25878e5186ebd98823814188acfbe';
const hook = '0xe5e702641ea86f4ae6cc3cdaed2b886f976be044';
const receiver = '0xcceb9655af6877d5c8c2919902c356bed71fa1fc';
const other = '0x0000000000000000000000000000000000000001';
const native = '0x0000000000000000000000000000000000000000';

function options(toBlock = 60425312, credits: any[] = []) {
  return {
    createBalances: () => new Balance(),
    getToBlock: async () => toBlock,
    getLogs: async ({ eventAbi, target }: any) => {
      if (eventAbi === feePaid) return [{ token: native, feeAmount: 19n }];
      if (eventAbi === settled) return [{ tokenOut: other, feeAmount: 31n }];
      assert.equal(target, '0xd3afeb2a57f70ef218aa82451c51b2fb0416ac9e');
      assert.equal(eventAbi, 'event Credited(address indexed recipient,address indexed depositor,uint256 amount)');
      return credits;
    },
  } as unknown as FetchOptions;
}

test('creator income requires both hook and recipient; swap fees remain separate', async () => {
  const result: any = await adapter.fetch!(options(60425312, [
    { recipient: manager.toUpperCase(), depositor: hook.toUpperCase(), amount: 1234567890123456789n },
    { recipient: manager, depositor: hook, amount: 1n },
    { recipient: manager, depositor: receiver, amount: 100n },
    { recipient: manager, depositor: other, amount: 200n },
    { recipient: other, depositor: hook, amount: 300n },
  ]));
  assert.deepEqual(result.dailyOtherIncome.values, { 'native:ROUTE Creator Income': 1234567890123456790n });
  assert.deepEqual(result.dailyFees.values, { 'native:Swap Fees': 19n, [`${other}:Swap Fees`]: 31n });
  assert.deepEqual(result.dailyRevenue.values, { 'native:Swap Fees To Route': 19n, [`${other}:Swap Fees To Route`]: 31n });
  assert.deepEqual(result.dailyProtocolRevenue.values, result.dailyRevenue.values);
  assert.notEqual(result.dailyProtocolRevenue, result.dailyRevenue);
  assert.equal(result.dailyHoldersRevenue, undefined);
});

test('unmapped earlier history is omitted; known empty current window is zero', async () => {
  assert.equal((await adapter.fetch!(options(59844470))).dailyOtherIncome, undefined);
  const result: any = await adapter.fetch!(options(59844471));
  assert.deepEqual(result.dailyOtherIncome.values, {});
});

test('creator RPC failure propagates instead of reporting zero', async () => {
  const opts = options();
  const original = opts.getLogs;
  opts.getLogs = async params => {
    if (params.eventAbi !== feePaid && params.eventAbi !== settled) throw new Error('creator RPC failed');
    return original(params);
  };
  await assert.rejects(() => adapter.fetch!(opts), /creator RPC failed/);
});
