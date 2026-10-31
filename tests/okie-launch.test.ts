import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Balances } from '@defillama/sdk';
import { Interface } from 'ethers';
import type { FetchGetLogsOptions, FetchOptions, FetchV2 } from '../adapters/types';
import adapter from '../dexs/okie-launch';

const { getLogParams } = require('@defillama/sdk/build/util/logs');
const fetch = adapter.adapter.xlayer.fetch as FetchV2;
const factory = '0xeb554444b5c49bab7781b1cfc0e3be211053c6d7';
const token = '0x0000000000000000000000000000000000000001';
const trader = '0x0000000000000000000000000000000000000002';
const deployedEvents = new Interface([
  'event Bought(address indexed token, address indexed buyer, uint256 paidAmount, uint256 tokenAmount)',
  'event Sold(address indexed token, address indexed seller, uint256 tokenAmount, uint256 receivedAmount)',
]);

function fixture(buys: bigint[], sells: bigint[], failure?: string) {
  const requests: FetchGetLogsOptions[] = [];
  const options = {
    createBalances: () => new Balances({ chain: 'xlayer' }),
    getLogs: async (params: FetchGetLogsOptions) => {
      requests.push(params);
      assert.equal(params.target, factory);
      const eventName = params.eventAbi!.includes('Bought') ? 'Bought' : 'Sold';
      if (failure === eventName) throw new Error(`${eventName} source unavailable`);
      const { transformLog } = await getLogParams({
        ...params, chain: 'xlayer', fromBlock: 1, toBlock: 2, onlyArgs: true,
      });
      const amounts = eventName === 'Bought' ? buys : sells;
      return amounts.map(amount => {
        const values = eventName === 'Bought'
          ? [token, trader, amount, 987654321n]
          : [token, trader, 987654321n, amount];
        const encoded = deployedEvents.encodeEventLog(eventName, values);
        assert.equal(encoded.topics.length, 3);
        return transformLog({ ...encoded, address: factory, blockNumber: 2 });
      });
    },
  } as unknown as FetchOptions;
  return { options, requests };
}

function amount(balance: unknown) {
  return Object.values((balance as Balances).getBalances())
    .reduce<number>((sum, value) => sum + Number(value), 0);
}

test('decodes three-topic sells and counts native proceeds, not token amounts', async () => {
  const { options } = fixture([], [10000n, 20000n]);
  const result = await fetch(options);
  assert.equal(amount(result.dailyVolume), 30300);
  assert.equal(amount(result.dailyFees), 303);
  assert.equal(amount(result.dailyRevenue), 303);
  assert.equal(amount(result.dailyProtocolRevenue), 303);
});

test('preserves buy accounting when no sells occur', async () => {
  const { options } = fixture([9900n, 19800n], []);
  const result = await fetch(options);
  assert.equal(amount(result.dailyVolume), 30000);
  assert.equal(amount(result.dailyFees), 300);
});

test('combines independent buys and sells once each', async () => {
  const { options, requests } = fixture([9900n], [10000n]);
  const result = await fetch(options);
  assert.equal(amount(result.dailyVolume), 20100);
  assert.equal(amount(result.dailyFees), 201);
  assert.equal(requests.length, 2);
});

test('returns empty balances for a successfully read empty window', async () => {
  const { options } = fixture([], []);
  const result = await fetch(options);
  assert.equal(amount(result.dailyVolume), 0);
  assert.equal(amount(result.dailyFees), 0);
});

for (const eventName of ['Bought', 'Sold']) {
  test(`propagates required ${eventName} read failures`, async () => {
    const { options } = fixture([], [], eventName);
    await assert.rejects(fetch(options), new RegExp(`${eventName} source unavailable`));
  });
}
