import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Balances } from '@defillama/sdk';
import type { FetchGetLogsOptions, FetchOptions, FetchV2 } from '../adapters/types';
import adapter from '../fees/gas-cash';

const fetch = adapter.fetch as FetchV2;
const token = '0xa30FA36Db767ad9eD3f7a60fC79526fB4d56D344';
const legacyPool = '0xdE597816a8473C059C846B77EE4ABaC8EbaB1770';
const previousPool = '0xd3F3E252B79260E95Ad7DFb311FFFBd90f81ab78';
const currentPool = '0xbc4C09A863878Ac4Ee0Dc6167C3C121e3b06eaC1';
const buybacks = '0x18eD3E25Fb4786EA60021E2e9A2Da0A52602f503';

function forwarded(to: string, blockNumber: number, logIndex: number, amount = '75') {
  return { args: { token, to, amount }, blockNumber, logIndex };
}

type Forward = ReturnType<typeof forwarded>;

function options(splitterForwards: Forward[], receiverForwards: Forward[] = []) {
  return {
    chain: 'robinhood',
    createBalances: () => new Balances({ chain: 'robinhood' }),
    getLogs: async (params: FetchGetLogsOptions) => params.targets
      ? [receiverForwards, splitterForwards]
      : [],
  } as unknown as FetchOptions;
}

function amount(balance: unknown) {
  return Object.values((balance as Balances).getBalances())
    .reduce<bigint>((total, value) => total + BigInt(value), 0n);
}

test('classifies the rotated prize vault as supply-side revenue, keeping buybacks separate', async () => {
  const result = await fetch(options([
    forwarded(currentPool.toLowerCase(), 102800000, 1),
    forwarded(buybacks, 102800000, 2, '25'),
  ]));
  assert.equal(amount(result.dailyFees), 100n);
  assert.equal(amount(result.dailySupplySideRevenue), 75n);
  assert.equal(amount(result.dailyRevenue), 25n);
  assert.equal(amount(result.dailyHoldersRevenue), 25n);
  assert.equal(amount(result.dailyProtocolRevenue), 0n);
});

test('preserves both earlier prize destinations and same-block rotation ordering', async () => {
  const result = await fetch(options([
    forwarded(legacyPool, 94930729, 20),
    forwarded(legacyPool, 94930730, 8),
    forwarded(previousPool, 94930730, 10),
    forwarded(previousPool, 101536275, 20),
    forwarded(previousPool, 101536276, 2),
    forwarded(currentPool, 101536276, 4),
  ]));
  assert.equal(amount(result.dailyFees), 450n);
  assert.equal(amount(result.dailySupplySideRevenue), 450n);
  assert.equal(amount(result.dailyRevenue), 0n);
});

test('does not accept the new vault before its rotation event', async () => {
  for (const [blockNumber, logIndex] of [[101536275, 20], [101536276, 2], [101536276, 3]]) {
    await assert.rejects(fetch(options([forwarded(currentPool, blockNumber, logIndex)])), /unknown fee destination/);
  }
});

test('does not accept retired destinations after their rotation', async () => {
  await assert.rejects(fetch(options([forwarded(legacyPool, 94930730, 10)])), /unknown fee destination/);
  await assert.rejects(fetch(options([forwarded(previousPool, 101536276, 4)])), /unknown fee destination/);
});

test('continues to reject an unclassified destination', async () => {
  await assert.rejects(fetch(options([
    forwarded('0x0000000000000000000000000000000000000001', 102800000, 1),
  ])), /unknown fee destination/);
});

test('counts final forwards once and still excludes the launch tax', async () => {
  const result = await fetch(options([
    forwarded(currentPool, 102800000, 2),
    forwarded(buybacks, 102800000, 3, '25'),
  ], [
    forwarded('0x5DbDBfa1D0AbA8755a4c08E9FCDDB0b5d2CAbfB0', 102800000, 1, '100'),
    forwarded('0x8A890f77Beee8438908a2A790058e7AC39605b87', 70084575, 1, '1000'),
  ]));
  assert.equal(amount(result.dailyFees), 100n);
  assert.equal(amount(result.dailySupplySideRevenue), 75n);
});

test('continues to reject missing log positions', async () => {
  const malformed = { args: { token, to: currentPool, amount: '75' } } as Forward;
  await assert.rejects(fetch(options([malformed])), /missing blockNumber, logIndex, or args/);
});
