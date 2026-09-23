import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Interface } from 'ethers';
import adapter, { settled, fetchRouteAccounting } from '../route';
import fixtures from './fixtures.json';

// Raw logs in fixtures.json are independently inspectable on Robinhood Blockscout
// using their transactionHash. Values below reconcile those receipts, without USD pricing.
// Run: node -r ts-node/register/transpile-only --test aggregators/route/route.test.ts
const native = '0x0000000000000000000000000000000000000000';
const route = '0x4a72b9702f991b790788f8afa9e7112541f4e8f8';
const usdg = '0x5fc5360d0400a0fd4f2af552add042d716f1d168';
class Balances {
  chain = 'robinhood';
  values: Record<string, bigint> = {};
  add(token: string, amount: any, label = '') {
    const key = `${token.toLowerCase()}:${label}`;
    this.values[key] = (this.values[key] ?? 0n) + BigInt(amount);
  }
  addGasToken(amount: any, label: string) { this.add(native, amount, label); }
  clone() { const b = new Balances(); b.values = { ...this.values }; return b; }
}
const value = (b: Balances, token: string, label: string) => b.values[`${token}:${label}`] ?? 0n;
async function run(rows: any[], fromBlock = 0, toBlock = Infinity, fetch = adapter.fetch!) {
  return fetch({
    chain: 'robinhood', getFromBlock: async () => fromBlock, getToBlock: async () => toBlock,
    createBalances: () => new Balances(),
    getLogs: async ({ target, targets, eventAbi, topics, onlyArgs = true, fromBlock: logFrom = fromBlock, toBlock: logTo = toBlock }: any) => {
      const iface = new Interface([eventAbi]);
      const event = iface.fragments[0] as any;
      return rows.filter(l => Number(l.blockNumber) >= logFrom && Number(l.blockNumber) <= logTo &&
        (targets ?? [target]).includes(l.address.toLowerCase()) && l.topics[0] === event.topicHash &&
        (!topics || topics.every((t: string | null, i: number) => t === null || t === l.topics[i])))
        .map(l => { const args = iface.decodeEventLog(event, l.data, l.topics); return onlyArgs ? args : { ...l, args }; });
    },
  } as any) as any;
}
function eventLog(address: string, abi: string, args: any[], blockNumber = '70000000') {
  const iface = new Interface([abi]);
  const event = iface.encodeEventLog(iface.fragments[0] as any, args);
  return { address, ...event, blockNumber, transactionHash: '0x' + 'ab'.repeat(32) };
}

test('current fee emitters reconcile actual fees once, including Premium native fees', async () => {
  const premium = eventLog('0x84497be24ae78b3232f7009d619a33eb500a46cf', settled, [native, native, native, 1000, 10, 1, 999]);
  const out = await run([...fixtures.slice(0, 3), premium, { ...premium, address: '0x' + '11'.repeat(20) }]);
  const expected = 765117419473802806870n + 76360530970277417320n;
  assert.equal(value(out.dailyFees, route, 'Swap Fees'), expected);
  assert.equal(value(out.dailyRevenue, route, 'Swap Fees To Route'), expected);
  assert.equal(value(out.dailyFees, usdg, 'Swap Fees'), 95438n);
  assert.equal(value(out.dailyFees, native, 'Swap Fees'), 1n);
});

test('Ramp reads the indexed Executed ABI and separates full LP funding from dedicated buys', async () => {
  const out = await run([fixtures[3]]);
  assert.equal(value(out.dailyHoldersRevenue, native, 'Token Buy Back'), 19369721762768720n);
  assert.equal(value(out.dailyHoldersRevenue, native, 'Liquidity Funding'), 0n);
  assert.equal(Object.values(out.dailyHoldersRevenue.values).reduce((sum: bigint, n: any) => sum + n, 0n), 19369721762768720n);
  assert.equal(out.dailyCapitalAllocation, undefined);
  const accounting = await run([fixtures[3]], 0, Infinity, fetchRouteAccounting);
  assert.equal(value(accounting.dailyCapitalAllocation, native, 'Liquidity Funding'), 19369721762768720n);
  assert.equal(value(out.dailyProtocolRevenue, native, 'Liquidity Funding'), 0n);
  assert.equal(value(out.dailyRevenue, native, 'Creator Fees To Route'), 0n);
  assert.equal(value(out.dailyProtocolRevenue, native, 'Token Buy Back'), -19369721762768720n);
});

test('legacy LP budgets are capital allocation and never holder income or revenue deductions', async () => {
  const abi = 'event Executed(uint256 indexed sequence,uint256 revenue,uint256 buybackEth,uint256 lpBudget,uint256 vaultEth,uint256 buybackTokens,uint256 positionId,uint128 liquidityAdded)';
  const cycle = eventLog('0xda5790345fd25878e5186ebd98823814188acfbe', abi, [1, 100, 35, 30, 35, 123, 1, 100]);
  const out = await run([cycle], 0, Infinity, fetchRouteAccounting);
  assert.deepEqual(out.dailyHoldersRevenue.values, { [`${native}:Token Buy Back`]: 35n });
  assert.deepEqual(out.dailyProtocolRevenue.values, { [`${native}:Token Buy Back`]: -35n });
  assert.deepEqual(out.dailyCapitalAllocation.values, { [`${native}:Liquidity Funding`]: 30n });
});

test('creator accounting isolates the ROUTE pool and does not recount escrow credits', async () => {
  const otherPool = { ...fixtures[4], topics: [fixtures[4].topics[0], '0x' + '11'.repeat(32)] };
  const credit = eventLog('0xd3afeb2a57f70ef218aa82451c51b2fb0416ac9e',
    'event Credited(address indexed recipient,address indexed depositor,uint256 amount)',
    ['0xdd4f63ff19b8a871fadc734de2c5fe13b35f1631', fixtures[4].address, 1052973735500944n]);
  const out = await run([fixtures[4], otherPool, credit]);
  assert.equal(value(out.dailyFees, native, 'Creator Fees'), 1052973735500944n);
  assert.equal(value(out.dailyRevenue, native, 'Creator Fees To Route'), 1052973735500944n);
});

test('early dev purchase uses actual pool input and ignores unreviewed/launch transactions', async () => {
  const unreviewed = { ...fixtures[5], transactionHash: '0x' + '11'.repeat(32) };
  const launch = { ...fixtures[5], transactionHash: '0xd0d0a88231c0e48d59f804e9ab5d082a5e758e9993ba1c624753798e59634ace' };
  const out = await run([fixtures[5], unreviewed, launch]);
  assert.equal(value(out.dailyHoldersRevenue, native, 'Token Buy Back'), 297000000000000000n);
});

test('new wrapper volume is counted once and the inner executor is excluded', async () => {
  const abi = 'event Swapped(address indexed sender,address indexed recipient,address indexed tokenIn,address tokenOut,uint256 amountIn,uint256 amountOut)';
  const wrapper = '0x486c62ba146823324722ec3350f0296fd7cae3a0';
  const inner = eventLog('0x9990a63ef329ab407956b4fe5a812aba0d81e20c', abi, [wrapper, native, usdg, route, 1000000, 123]);
  const outer = eventLog(wrapper, abi, [native, native, usdg, route, 1000000, 120]);
  const out = await run([inner, outer]);
  assert.equal(value(out.dailyVolume, usdg, ''), 1000000n);
});

test('adjacent windows include a boundary event only once', async () => {
  const block = Number(fixtures[3].blockNumber);
  const before = await run([fixtures[3]], block - 2, block - 1);
  // Production hourly windows share this endpoint; the adapter must exclude it.
  const sharedBefore = await run([fixtures[3]], block - 1, block);
  const after = await run([fixtures[3]], block, block + 1);
  assert.equal(value(before.dailyHoldersRevenue, native, 'Token Buy Back'), 0n);
  assert.equal(value(sharedBefore.dailyHoldersRevenue, native, 'Token Buy Back'), 0n);
  assert.equal(value(after.dailyHoldersRevenue, native, 'Token Buy Back'), 19369721762768720n);
});
