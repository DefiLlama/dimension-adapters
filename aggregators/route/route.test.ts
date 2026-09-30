import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Interface } from 'ethers';
import adapter, { settled, builderSettled, arcExecuted, fetchRouteAccounting } from '../route';
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
  usd = 0;
  addUSDValue(amount: number) { this.usd += amount; }
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

test('September 26 manager, collectors and executors are tracked', async () => {
  const rampAbi = 'event Executed(uint256 indexed sequence,uint256 revenue,uint256 buybackEth,uint256 lpBudget,uint256 vaultEth,uint256 buybackTokens,uint256 indexed rangeId,uint128 addedShares,address indexed lpOwner)';
  const swapAbi = 'event Swapped(address indexed sender,address indexed recipient,address indexed tokenIn,address tokenOut,uint256 amountIn,uint256 amountOut)';
  const feeAbi = 'event OutputFee(address indexed token,uint256 gross,uint256 feeBps,uint256 feeAmount)';
  const lpOwner = '0x09efc01e903033d6642d20a8c5cf6bee210cfbf8';
  const cycle = eventLog('0xd6fa32a8cfb31c2f237059e4f19a5eff79047957', rampAbi, [0, 1000, 600, 50, 350, 1, 0, 0, lpOwner]);
  const direct = '0x1562b4ea2cc64c36a7025d04426bcf2729222ebb';
  const swap = eventLog(direct, swapAbi, [native, native, usdg, route, 5000, 99]);
  const fee = eventLog(direct, feeAbi, [route, 100, 10, 1]);
  const collector = eventLog('0x66537759eb8fcea1d4b6b55405eaf8dd3e13fd53', settled, [native, native, usdg, 1000, 10, 1, 999]);
  const out = await run([cycle, swap, fee, collector], 0, Infinity, fetchRouteAccounting);
  assert.equal(value(out.dailyHoldersRevenue, native, 'Token Buy Back'), 600n);
  assert.equal(value(out.dailyCapitalAllocation, native, 'Liquidity Funding'), 50n);
  assert.equal(value(out.dailyVolume, usdg, ''), 5000n);
  assert.equal(value(out.dailyFees, route, 'Swap Fees'), 1n);
  assert.equal(value(out.dailyFees, usdg, 'Swap Fees'), 1n);
});

test('Route v2 collector reports gross output volume and its fee once', async () => {
  const v2 = eventLog('0x9f8f538ea588ccf935876527115bb2a834c2f5fc', settled, [native, native, usdg, 10000, 10, 10, 9990]);
  const out = await run([v2]);
  assert.equal(value(out.dailyVolume, usdg, ''), 10000n);
  assert.equal(value(out.dailyFees, usdg, 'Swap Fees'), 10n);
  assert.equal(value(out.dailyRevenue, usdg, 'Swap Fees To Route'), 10n);
});

test('builder settlements add the Route fee as revenue and the integrator fee as supply side only', async () => {
  const id = '0x' + '01'.repeat(32);
  const log = eventLog('0xcbe3987a243541cc9592ca08838cf1233c15f6e1', builderSettled,
    [id, id, id, native, native, usdg, 10000, 5, 20, 9975, native, 3, native, 1]);
  const out = await run([log]);
  assert.equal(value(out.dailyFees, usdg, 'Swap Fees'), 5n);
  assert.equal(value(out.dailyRevenue, usdg, 'Swap Fees To Route'), 5n);
  assert.equal(value(out.dailyFees, usdg, 'Builder Fees'), 20n);
  assert.equal(value(out.dailyRevenue, usdg, 'Builder Fees'), 0n);
  assert.equal(value(out.dailySupplySideRevenue, usdg, 'Builder Fees'), 20n);
  // Builder volume is already carried by the inner engine's Swapped event.
  assert.deepEqual(out.dailyVolume.values, {});
});

test('Arc executor contributes volume only', async () => {
  const usdc = '0x3600000000000000000000000000000000000000';
  const token = '0x545030e5ca372756940691be0b186e293d83ed3f';
  const log = eventLog('0x33c65ba72b023bf6b207d7b62275630ca433afb8', arcExecuted, [native, native, token, usdc, 10n ** 18n, 295000000]);
  const out = await run([log], 0, Infinity, (options: any) => adapter.fetch!({ ...options, chain: 'arc' } as any, {} as any));
  assert.equal(out.dailyVolume.usd, 295);
  assert.deepEqual(out.dailyVolume.values, {});
  const excluded = eventLog('0x33c65ba72b023bf6b207d7b62275630ca433afb8', arcExecuted,
    ['0xd5d7c80c9f8ddd278526a2e46f0a57275fa6116d', native, token, usdc, 10n ** 18n, 500000000]);
  const withExcluded = await run([log, excluded], 0, Infinity, (options: any) => adapter.fetch!({ ...options, chain: 'arc' } as any, {} as any));
  assert.equal(withExcluded.dailyVolume.usd, 295);
  assert.equal(out.dailyFees, 0);
});

test('wallets excluded from Route reporting add no volume', async () => {
  const abi = 'event Swapped(address indexed sender,address indexed recipient,address indexed tokenIn,address tokenOut,uint256 amountIn,uint256 amountOut)';
  const excluded = '0xd5d7c80c9f8ddd278526a2e46f0a57275fa6116d';
  const engine = '0x9990a63ef329ab407956b4fe5a812aba0d81e20c';
  const asSender = eventLog(engine, abi, [excluded, native, usdg, route, 1000, 1]);
  const asRecipient = eventLog(engine, abi, [native, excluded, usdg, route, 2000, 1]);
  const counted = eventLog(engine, abi, [native, native, usdg, route, 4000, 1]);
  const v2 = eventLog('0x9f8f538ea588ccf935876527115bb2a834c2f5fc', settled, [excluded, excluded, usdg, 8000, 10, 8, 7992]);
  const out = await run([asSender, asRecipient, counted, v2]);
  assert.equal(value(out.dailyVolume, usdg, ''), 4000n);
  assert.equal(value(out.dailyFees, usdg, 'Swap Fees'), 8n);
});
