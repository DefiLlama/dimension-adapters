import assert from 'node:assert/strict';
import test, { TestContext } from 'node:test';
import { Balances, ChainApi } from '@defillama/sdk';
import { FetchGetLogsOptions, FetchOptions } from '../adapters/types';
import adapter from '../fees/vfat';
import { nullAddress } from '../helpers/token';

const token = '0x1111111111111111111111111111111111111111';
const existingSickle = '0x2222222222222222222222222222222222222222';
const newSickle = '0x3333333333333333333333333333333333333333';
const unrelatedContract = '0x4444444444444444444444444444444444444444';
const oldAdmin = '0x5555555555555555555555555555555555555555';
const newAdmin = '0x6666666666666666666666666666666666666666';

const fee = (address: string, amount: string) => ({
  address,
  parsedLog: { args: { token, amount } },
});

function mockRegistry(t: TestContext, options: FetchOptions) {
  t.mock.method(ChainApi.prototype, 'multiCall', function (this: ChainApi, args: unknown) {
    assert.equal(this.chain, options.chain);
    assert.equal(this.block, 'latest', 'permanent membership must not require archive state');
    return options.api.multiCall(args as Parameters<ChainApi['multiCall']>[0]);
  });
}

for (const chain of Object.keys(adapter.adapter!)) {

  test(`${chain}: counts fees from existing and new Sickles, excluding other emitters`, async t => {
    const dailyFees = new Balances({ chain });
    const options = {
      chain,
      getFromBlock: async () => 100,
      getToBlock: async () => 200,
      createBalances: () => dailyFees,
      api: { multiCall: async ({ calls, abi, target }: { calls: string[]; abi: string; target: string }) => {
        assert.match(target, /^0x[0-9a-fA-F]{40}$/);
        if (abi === 'function admins(address) view returns (address)') {
          assert.deepEqual(calls, [existingSickle, unrelatedContract, newSickle]);
          return [oldAdmin, nullAddress, newAdmin];
        }
        assert.equal(abi, 'function sickles(address) view returns (address)');
        assert.deepEqual(calls, [oldAdmin, nullAddress, newAdmin]);
        return [existingSickle, nullAddress, newSickle];
      } },
      getLogs: async (query: FetchGetLogsOptions) => {
        assert.ok(!query.eventAbi?.startsWith('event Deploy'), 'discovery must not scan deployment history');
        assert.equal(query.fromBlock, 101, 'exclude the previous window closing block');
        if (query.eventAbi?.includes('bytes32 feesHash'))
          return [fee(existingSickle, '1000000'), fee(unrelatedContract, '9000000')];
        return [fee(existingSickle, '2000000'), fee(newSickle, '3000000')];
      },
    } as unknown as FetchOptions;

    mockRegistry(t, options);
    await adapter.fetch!(options);
    assert.equal(BigInt(dailyFees.getBalances()[`${chain}:${token}`]), 6000000n);
  });
}

test('propagates membership RPC failures instead of returning zero fees', async t => {
  const options = {
    chain: 'bsc',
    getFromBlock: async () => 100,
    getToBlock: async () => 200,
    createBalances: () => new Balances({ chain: 'bsc' }),
    getLogs: async () => [fee(existingSickle, '1000000')],
    api: { multiCall: async () => { throw new Error('archive RPC unavailable'); } },
  } as unknown as FetchOptions;
  mockRegistry(t, options);
  await assert.rejects(adapter.fetch!(options), /archive RPC unavailable/);
});

test('distinguishes a registered zero-admin Sickle from an unrelated emitter', async t => {
  const balances = new Balances({ chain: 'bsc' });
  const options = {
    chain: 'bsc',
    getFromBlock: async () => 100,
    getToBlock: async () => 200,
    createBalances: () => balances,
    getLogs: async (query: FetchGetLogsOptions) => query.eventAbi?.includes('bytes32')
      ? [fee(existingSickle, '1000000'), fee(unrelatedContract, '9000000')] : [],
    api: { multiCall: async ({ abi }: { abi: string }) => abi.includes('admins(')
      ? [nullAddress, nullAddress] : [existingSickle, existingSickle] },
  } as unknown as FetchOptions;
  mockRegistry(t, options);
  await adapter.fetch!(options);
  assert.equal(BigInt(balances.getBalances()[`bsc:${token}`]), 1000000n);
});

test('adjacent hourly windows count a boundary receipt once', async t => {
  let total = 0n;
  mockRegistry(t, { chain: 'base', api: {
    multiCall: async ({ abi, calls }: { abi: string; calls: string[] }) =>
      calls.map(() => abi.includes('admins(') ? oldAdmin : existingSickle),
  } } as unknown as FetchOptions);
  for (const [from, to] of [[100, 200], [200, 300]]) {
    const balances = new Balances({ chain: 'base' });
    await adapter.fetch!({
      chain: 'base',
      getFromBlock: async () => from,
      getToBlock: async () => to,
      createBalances: () => balances,
      getLogs: async (query: FetchGetLogsOptions) => {
        if (!query.eventAbi?.includes('bytes32')) return [];
        return [200, 201].filter(block => block >= query.fromBlock! && block <= to)
          .map(() => fee(existingSickle, '1000000'));
      },
      api: { multiCall: async ({ abi, calls }: { abi: string; calls: string[] }) =>
        calls.map(() => abi.includes('admins(') ? oldAdmin : existingSickle) },
    } as unknown as FetchOptions);
    total += BigInt(balances.getBalances()[`base:${token}`] || 0);
  }
  assert.equal(total, 2000000n);
});

test('a failed block lookup cannot turn into an unbounded fee-log read', async () => {
  await assert.rejects(adapter.fetch!({
    chain: 'base',
    createBalances: () => new Balances({ chain: 'base' }),
    getFromBlock: async () => null,
    getToBlock: async () => 200,
    getLogs: async () => { throw new Error('must not query logs'); },
  } as unknown as FetchOptions), /Missing or invalid fee window blocks/);
});

test('Cronos halt excludes the resume block until its actual time', async t => {
  const blocks = [0, 100, 200, 9000, 9001, 9002];
  const queried: Array<[number, number]> = [];
  const options = {
    chain: 'cronos', getFromBlock: async () => null, getToBlock: async () => null,
    createBalances: () => new Balances({ chain: 'cronos' }),
    api: {
      provider: { getBlock: async (height: number | string) => {
        const number = height === 'latest' ? blocks.length - 1 : Number(height);
        return { number, timestamp: blocks[number] };
      } },
      multiCall: async ({ calls }: { calls: string[] }) => calls,
    },
    getLogs: async ({ fromBlock, toBlock }: FetchGetLogsOptions) => {
      queried.push([fromBlock!, toBlock!]);
      return [];
    },
  } as unknown as FetchOptions;
  mockRegistry(t, options);
  await adapter.fetch!({ ...options, fromTimestamp: 300, toTimestamp: 3599 });
  assert.deepEqual(queried, [], 'a proven empty block range must not query logs');
  await adapter.fetch!({ ...options, fromTimestamp: 8999, toTimestamp: 9000 });
  assert.deepEqual(queried, [[3, 3], [3, 3]], 'both fee ABIs include the resume block once');
});

test('Cronos boundary recovery rejects unavailable state and a stale head', async () => {
  const options = {
    chain: 'cronos', fromTimestamp: 300, toTimestamp: 3599,
    getFromBlock: async () => null, getToBlock: async () => null,
    createBalances: () => new Balances({ chain: 'cronos' }),
    getLogs: async () => { throw new Error('must not query logs'); },
  } as unknown as FetchOptions;
  for (const getBlock of [async () => null, async () => ({ number: 20, timestamp: 200 })]) {
    await assert.rejects(adapter.fetch!({ ...options, api: { provider: { getBlock } } } as unknown as FetchOptions), /head is behind/);
  }
  await assert.rejects(adapter.fetch!({ ...options, api: { provider: {
    getBlock: async (block: string | number) => block === 'latest' ? { number: 20, timestamp: 4000 } : null,
  } } } as unknown as FetchOptions), /Missing Cronos fee boundary block/);
});

test('normalizes native fee aliases without mixing Arc ERC-20 USDC units', async t => {
  const balances = new Balances({ chain: 'arc' });
  const usdc = '0x3600000000000000000000000000000000000000';
  const options = {
    chain: 'arc', getFromBlock: async () => 100, getToBlock: async () => 200,
    createBalances: () => balances,
    api: { multiCall: async ({ calls }: { calls: string[] }) => calls },
    getLogs: async (query: FetchGetLogsOptions) => query.eventAbi?.includes('bytes32')
      ? ['0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', nullAddress].map(token => ({
        address: existingSickle, parsedLog: { args: { token, amount: '1000000000000000000' } },
      }))
      : [{ address: existingSickle, parsedLog: { args: { token: usdc, amount: '2000000' } } }],
  } as unknown as FetchOptions;
  mockRegistry(t, options);
  await adapter.fetch!(options);
  assert.deepEqual(balances.getBalances(), {
    [`arc:${nullAddress}`]: '2000000000000000000', [`arc:${usdc}`]: '2000000',
  });
});
