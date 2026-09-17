import assert from 'node:assert/strict';
import test from 'node:test';
import { Balances } from '@defillama/sdk';
import { FetchGetLogsOptions, FetchOptions } from '../adapters/types';
import adapter from '../fees/vfat';

const token = '0x1111111111111111111111111111111111111111';
const existingSickle = '0x2222222222222222222222222222222222222222';
const newSickle = '0x3333333333333333333333333333333333333333';
const unrelatedContract = '0x4444444444444444444444444444444444444444';
const windowStart = 300000000;
const deployments = [
  { blockNumber: 200000000, sickle: existingSickle },
  { blockNumber: windowStart + 1, sickle: newSickle },
];

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
      getLogs: async (query: FetchGetLogsOptions) => {
        if (query.eventAbi?.startsWith('event Deploy')) {
          // The runner defaults an omitted fromBlock to the current window.
          const fromBlock = query.fromBlock ?? windowStart;
          return deployments.filter(log => log.blockNumber >= fromBlock);
        }
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
