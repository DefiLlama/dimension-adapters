import assert from 'node:assert/strict';
import test from 'node:test';
import { Balances, ChainApi } from '@defillama/sdk';
import { FetchOptions } from '../adapters/types';
import fees, { launchFeesInRange, quoteFeeParts } from '../fees/genius-fun';
import volume from '../dexs/genius-fun';
import { deployments, EventLog, events, FeePolicy, getCurveTrades, nativeToken, splitFee } from '../helpers/genius-fun';

const policy: FeePolicy = { destinationBps: '100', platformBps: '50', creatorBps: '25', buybackBps: '25', foundationVault: '0x0000000000000000000000000000000000000001' };
const zeroPolicy: FeePolicy = { ...policy, destinationBps: '0', platformBps: '0', creatorBps: '0', buybackBps: '0' };
const factory = deployments[0].factory;
const hook = deployments[0].hook;
const curve = '0x0000000000000000000000000000000000000002';
const meme = '0x0000000000000000000000000000000000000003';
const poolId = `0x${'ab'.repeat(32)}`;
const transactionHash = `0x${'cd'.repeat(32)}`;
const row = (blockNumber: number, index: number, args: any, address = factory): EventLog => ({ blockNumber, index, args, address, transactionHash });
const amount = (balance: Balances) => BigInt(balance.getBalances()[`bsc:${nativeToken}`] ?? '0');

test('fee policy preserves full precision and assigns contract rounding to creator', () => {
  assert.deepEqual(splitFee(1000000000000000001n, 7n, policy), {
    destination: 500000000000000000n, platform: 250000000000000000n,
    buyback: 125000000000000000n, creator: 125000000000000008n,
  });
  assert.deepEqual(splitFee(9900n, 7n, zeroPolicy), { destination: 0n, platform: 0n, creator: 9907n, buyback: 0n });
});

test('creation fee changes apply in block and log order, including same-block launches', () => {
  const updates = [row(11, 2, { launchFee: '5' }), row(13, 0, { launchFee: '0' })];
  const launches = [row(11, 1, {}), row(11, 3, {}), row(12, 0, {}), row(13, 1, {})];
  assert.equal(launchFeesInRange(2n, updates, launches), 12n);
});

test('hook fee currency conversion uses execution ratio and balances to the quote wei', () => {
  assert.deepEqual(quoteFeeParts(11n, 2n, policy, 7n, 3n), {
    total: 30n, destination: 11n, platform: 4n, buyback: 2n, creator: 13n,
  });
  assert.throws(() => quoteFeeParts(1n, 0n, policy, 0n, 1n), /invalid swap valuation/);
});

function optionsFor(logs: Record<string, EventLog[]>, from = 122267000, to = 122267010) {
  const calls: any[] = [];
  const options = {
    chain: 'bsc',
    api: { provider: { getTransactionReceipt: async () => { throw new Error('Unexpected receipt'); } } },
    getFromBlock: async () => from - 1,
    getToBlock: async () => to,
    createBalances: () => new Balances({ chain: 'bsc' }),
    getLogs: async (query: any) => {
      calls.push(query);
      return (logs[query.eventAbi] ?? []).filter(log =>
        log.blockNumber >= query.fromBlock && log.blockNumber <= query.toBlock &&
        (!query.target || log.address.toLowerCase() === query.target.toLowerCase()) &&
        (!query.targets || query.targets.map((target: string) => target.toLowerCase()).includes(log.address.toLowerCase()))
      ).map(log => query.entireLog ? log : log.args);
    },
  } as unknown as FetchOptions;
  return { options, calls };
}

test('volume counts gross quote once, excludes boundary block, refunds and unrelated emitters', async () => {
  const logs = {
    [events.launch]: [row(122266900, 0, { curve, pairToken: nativeToken })],
    [events.buy]: [row(122266999, 0, { quoteIn: '99999' }, curve), row(122267000, 1, { quoteIn: '1000' }, curve)],
    [events.sell]: [row(122267010, 1, { quoteOut: '777', fee: '200', tax: '23' }, curve)],
  };
  const { options } = optionsFor(logs);
  const result: any = await volume.fetch!(options);
  assert.equal(amount(result.dailyVolume), 2000n);
  const previous: any = await volume.fetch!(optionsFor(logs, 122266999, 122266999).options);
  assert.equal(amount(previous.dailyVolume), 99999n);
});

test('large curve sets use scoped event scans and reject other factories’ events', async () => {
  const launches = Array.from({ length: 100 }, (_, index) => row(122266900, index, { curve: `0x${(index + 1).toString(16).padStart(40, '0')}`, pairToken: nativeToken }));
  const { options, calls } = optionsFor({
    [events.launch]: launches,
    [events.buy]: [row(122267000, 0, { quoteIn: '10' }, curve), row(122267000, 1, { quoteIn: '999' }, factory)],
  });
  const trades = await getCurveTrades(options);
  assert.equal(trades.buys.length, 1);
  assert.equal(calls.find(call => call.eventAbi === events.buy).noTarget, true);
  assert.equal(calls.find(call => call.eventAbi === events.buy).maxBlockRange, 9000);
});

test('fees accrue once with historical creation pricing, snipe included, and Foundation retained', async t => {
  const historicBlocks: (string | number | undefined)[] = [];
  t.mock.method(ChainApi.prototype, 'call', async function (this: ChainApi) { historicBlocks.push(this.block); return '2000'; });
  t.mock.method(ChainApi.prototype, 'multiCall', async ({ abi, calls }: any) => calls.map(() => abi.includes('foundationFeePolicy') ? policy : true));
  const { options, calls } = optionsFor({
    [events.launch]: [row(122267001, 0, { curve, pairToken: nativeToken })],
    [events.buy]: [row(122267001, 1, { quoteIn: '10000', fee: '9900', tax: '0' }, curve)],
    [events.sell]: [row(122267002, 1, { quoteOut: '800', fee: '200', tax: '0' }, curve)],
    [events.launchFee]: [row(122267003, 0, { launchFee: '3000' })],
  });
  const result: any = await fees.fetch!(options);
  assert.deepEqual(historicBlocks, [122266999]);
  assert.equal(amount(result.dailyFees), 12100n);
  assert.equal(amount(result.dailyRevenue), 9575n); // 2000 creation + 75% of 10100 trading
  assert.equal(amount(result.dailySupplySideRevenue), 2525n);
  assert.equal(amount(result.dailyFees), amount(result.dailyRevenue) + amount(result.dailySupplySideRevenue));
  assert.notEqual(result.dailyRevenue, result.dailyProtocolRevenue);
  assert.ok(!calls.some(call => /SnipeTaxCharged|FeesSwept|Credited|Claimed/.test(call.eventAbi)));
});

test('multiple meme-fee swaps in one transaction keep their own execution price', async t => {
  t.mock.method(ChainApi.prototype, 'multiCall', async ({ abi, calls }: any) => calls.map(() => {
    if (abi.startsWith('function launches')) return { registered: true, memecoinIsCurrency0: true, memecoin: meme, quoteToken: nativeToken };
    if (abi.includes('poolFoundationFeePolicy')) return [policy, false];
    throw new Error('Unexpected multicall');
  }));
  const { options, calls } = optionsFor({ [events.hookFee]: [
    row(122267002, 11, { poolId, currency: meme, feeAmount: '200', taxAmount: '0' }, hook),
    row(122267002, 21, { poolId, currency: meme, feeAmount: '200', taxAmount: '0' }, hook),
  ], [events.swap]: [
    row(122267002, 10, { id: poolId, amount0: '-1000', amount1: '2000' }, '0xa0FfB9c1CE1Fe56963B0321B32E7A0302114058b'),
    row(122267002, 20, { id: poolId, amount0: '-1000', amount1: '3000' }, '0xa0FfB9c1CE1Fe56963B0321B32E7A0302114058b'),
  ] });
  const result: any = await fees.fetch!(options);
  assert.equal(amount(result.dailyFees), 1000n);
  assert.equal(amount(result.dailyRevenue), 250n);
  assert.equal(amount(result.dailySupplySideRevenue), 750n);
  assert.deepEqual(calls.find(call => call.eventAbi === events.swap).extraTopics, [[poolId]]);
});

test('Alpha fees count actual payment and exclude free grants', async t => {
  t.mock.method(ChainApi.prototype, 'multiCall', async () => []);
  const registry = '0x9d60A14653b266F9D09E2137a5236F0C112eD42b';
  const { options } = optionsFor({ [events.alpha]: [
    row(122875700, 1, { paidWei: '390000000000000000' }, registry),
    row(122875700, 2, { paidWei: '0' }, registry),
  ] }, 122875700, 122875701);
  const result: any = await fees.fetch!(options);
  assert.equal(amount(result.dailyFees), 390000000000000000n);
  assert.equal(amount(result.dailyRevenue), 390000000000000000n);
  assert.equal(amount(result.dailySupplySideRevenue), 0n);
});

test('a 4.2 snipe surcharge with zero ordinary fee policy accrues entirely to the creator', async t => {
  t.mock.method(ChainApi.prototype, 'multiCall', async ({ abi, calls }: any) => calls.map(() => abi.includes('foundationFeePolicy') ? zeroPolicy : true));
  const { options } = optionsFor({
    [events.launch]: [row(122875000, 0, { curve, pairToken: nativeToken }, deployments[1].factory)],
    [events.buy]: [row(122875702, 1, { quoteIn: '10000', fee: '9900', tax: '0' }, curve)],
  }, 122875700, 122875710);
  const result: any = await fees.fetch!(options);
  assert.equal(amount(result.dailyFees), 9900n);
  assert.equal(amount(result.dailyRevenue), 0n);
  assert.equal(amount(result.dailySupplySideRevenue), 9900n);
});
