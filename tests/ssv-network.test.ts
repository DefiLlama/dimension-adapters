import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Balances } from '@defillama/sdk';
import type { FetchGetLogsOptions, FetchOptions, FetchV2 } from '../adapters/types';
import adapter from '../fees/ssv-network';

const graphql = require('graphql-request');
const fetch = adapter.fetch as FetchV2;

function fixture() {
  const before = ['500', '900', '0'];
  const after = ['580', '0', '45'];
  const fromApi = {
    multiCall: async () => before,
  };
  const toApi = {
    provider: { getStorage: async () => '0x03' },
    multiCall: async ({ abi }: { abi: string }) => abi.includes('getOperatorById')
      ? [{ fee: '1', validatorCount: '1' }, { fee: '0', validatorCount: '0' }, { fee: '1', validatorCount: '1' }]
      : after,
  };
  const logRequests: FetchGetLogsOptions[] = [];
  const options = {
    chain: 'ethereum',
    startOfDay: Date.UTC(2026, 9, 18) / 1000,
    getFromBlock: async () => 100,
    getToBlock: async () => 120,
    createBalances: () => new Balances({ chain: 'ethereum' }),
    fromApi,
    toApi,
    getLogs: async (params: FetchGetLogsOptions) => {
      logRequests.push(params);
      const logs = params.eventAbi!.includes('FeesSynced')
        ? [{ blockNumber: 100, newFeesWei: '1000' }, { blockNumber: 110, newFeesWei: '100' }]
        : [{ blockNumber: 100, value: '900' }, { blockNumber: 115, value: '950' }];
      return logs.filter(log => log.blockNumber >= (params.fromBlock ?? 100)
        && log.blockNumber <= (params.toBlock ?? 120));
    },
  } as unknown as FetchOptions;
  return { options, fromApi, toApi, before, after, logRequests };
}

function amount(value: unknown) {
  return Object.values((value as Balances).getBalances())
    .reduce<bigint>((sum, balance) => sum + BigInt(balance), 0n);
}

test('counts accrued earnings, including new and removed operators, without counting opening-block withdrawals', async () => {
  const { options, logRequests } = fixture();
  const result = await fetch(options);

  // The removed operator earns 50 before its balance is paid out and reset.
  assert.equal(amount(result.dailySupplySideRevenue), 175n);
  assert.equal(amount(result.dailyFees), 275n);
  assert.equal(amount(result.dailyRevenue), 100n);
  assert.equal(amount(result.dailyHoldersRevenue), 100n);
  assert.equal(logRequests.length, 2);
  for (const request of logRequests) {
    assert.equal(request.fromBlock, 101);
    assert.equal(request.toBlock, 120);
  }
});

test('preserves small earnings deltas on balances above Number.MAX_SAFE_INTEGER', async () => {
  const { options, before, after } = fixture();
  before[0] = '9007199254740993000000';
  after[0] = '9007199254740993000017';
  const result = await fetch(options);
  assert.equal(amount(result.dailySupplySideRevenue), 112n);
});

test('fails when an opening earnings snapshot cannot be read', async () => {
  const { options, fromApi } = fixture();
  fromApi.multiCall = async () => { throw new Error('archive read failed'); };
  await assert.rejects(fetch(options), /archive read failed/);
});

test('fails when operator discovery cannot be read instead of using a fixed id limit', async () => {
  const { options, toApi } = fixture();
  toApi.provider.getStorage = async () => { throw new Error('storage read failed'); };
  await assert.rejects(fetch(options), /storage read failed/);
});

test('rejects a negative ETH accrual after adding withdrawals', async () => {
  const { options, before } = fixture();
  before[0] = '2000';
  await assert.rejects(fetch(options), /Negative SSV operator earnings/);
});

test('keeps the legacy SSV-denominated path before the migration', async (t) => {
  const { options, fromApi, toApi } = fixture();
  options.startOfDay = Date.UTC(2026, 3, 21) / 1000;
  t.mock.method(graphql, 'request', async (_url: string, query: string) => {
    assert.match(query, /2026-04-21/);
    return { dailyProtocolStats: {
      dailyTotalFeesIncrease: '100000000000000000000',
      dailyNetworkEarningsIncrease: '30000000000000000000',
      dailyOperatorEarningsIncrease: '70000000000000000000',
    } };
  });
  fromApi.multiCall = toApi.multiCall = async () => { throw new Error('Unexpected ETH earnings call'); };
  options.getLogs = async (params) => {
    assert.match(params.eventAbi!, /Transfer/);
    return [{ value: '1000000000000000000' }];
  };

  const result = await fetch(options);
  assert.equal(amount(result.dailyFees), 100n);
  assert.equal(amount(result.dailyRevenue), 30n);
  assert.equal(amount(result.dailySupplySideRevenue), 70n);
  assert.equal(amount(result.dailyHoldersRevenue), 1000000000000000000n);
});
