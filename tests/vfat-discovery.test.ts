import assert from 'node:assert/strict';
import test from 'node:test';
import { Balances } from '@defillama/sdk';
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

for (const config of adapter.chains!) {
  const chain = typeof config === 'string' ? config : config[0];

  test(`${chain}: counts fees from existing and new Sickles, excluding other emitters`, async () => {
    const dailyFees = new Balances({ chain });
    const options = {
      chain,
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
        assert.equal(query.fromBlock, undefined, 'fee reads must keep the requested window');
        if (query.eventAbi?.includes('bytes32 feesHash'))
          return [fee(existingSickle, '1000000'), fee(unrelatedContract, '9000000')];
        return [fee(existingSickle, '2000000'), fee(newSickle, '3000000')];
      },
    } as unknown as FetchOptions;

    await adapter.fetch!(options);
    assert.equal(BigInt(dailyFees.getBalances()[`${chain}:${token}`]), 6000000n);
  });
}

test('propagates membership RPC failures instead of returning zero fees', async () => {
  const options = {
    chain: 'bsc',
    createBalances: () => new Balances({ chain: 'bsc' }),
    getLogs: async () => [fee(existingSickle, '1000000')],
    api: { multiCall: async () => { throw new Error('archive RPC unavailable'); } },
  } as unknown as FetchOptions;
  await assert.rejects(adapter.fetch!(options), /archive RPC unavailable/);
});

test('distinguishes a registered zero-admin Sickle from an unrelated emitter', async () => {
  const balances = new Balances({ chain: 'bsc' });
  const options = {
    chain: 'bsc',
    createBalances: () => balances,
    getLogs: async (query: FetchGetLogsOptions) => query.eventAbi?.includes('bytes32')
      ? [fee(existingSickle, '1000000'), fee(unrelatedContract, '9000000')] : [],
    api: { multiCall: async ({ abi }: { abi: string }) => abi.includes('admins(')
      ? [nullAddress, nullAddress] : [existingSickle, existingSickle] },
  } as unknown as FetchOptions;
  await adapter.fetch!(options);
  assert.equal(BigInt(balances.getBalances()[`bsc:${token}`]), 1000000n);
});
