import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { Balances } from '@defillama/sdk';
import axios from 'axios';
import type { FetchOptions } from '../adapters/types';
import adapter from '../fees/dreaming';
import { CHAIN } from '../helpers/chains';

const options = {
  fromTimestamp: 1786924800,
  toTimestamp: 1787011200,
  createBalances: () => new Balances({ chain: CHAIN.LYRA }),
} as FetchOptions;

test('Dream only registers historical Derive builder fees and no options adapter', () => {
  assert.deepEqual(Object.keys(adapter.adapter!), [CHAIN.LYRA]);
  assert.equal(adapter.adapter![CHAIN.LYRA].start, '2025-11-29');
  assert.equal(adapter.adapter![CHAIN.LYRA].deadFrom, '2026-10-06');
  assert.equal(existsSync(join(__dirname, '../options/dreaming.ts')), false);
  assert.deepEqual(Object.keys(adapter.methodology!), ['Fees', 'Revenue', 'ProtocolRevenue']);
  for (const labels of Object.values(adapter.breakdownMethodology!)) {
    assert.deepEqual(Object.keys(labels), ['Builder Referral Fees']);
  }
});

for (const [name, builderFees, referralRewards, expected] of [
  ['builder fees plus referral rewards', '12.5', '3.25', 15.75],
  ['no builder activity', '0', '0', 0],
] as const) {
  test(`Dream preserves ${name} without including venue fees`, async (context) => {
    const request = context.mock.method(axios, 'get', async (url: string) => {
      assert.equal(url, 'https://api.lyra.finance/public/get_referral_performance?start_ms=1786924800000&end_ms=1787011200000&referral_code=dream');
      return {
        status: 200,
        data: { result: {
          total_builder_fee_collected: builderFees,
          total_fee_rewards: referralRewards,
          total_referred_fees: '999999',
        } },
      };
    });

    const result = await adapter.adapter![CHAIN.LYRA].fetch!(options);
    assert.equal(request.mock.callCount(), 1);
    assert.deepEqual(Object.keys(result), ['dailyFees', 'dailyRevenue', 'dailyProtocolRevenue']);
    for (const balance of Object.values(result) as Balances[]) {
      assert.equal(Number(balance.getBalances()['coingecko:tether'] ?? 0), expected);
      if (expected > 0) {
        assert.deepEqual(Object.keys(balance._breakdownBalances), ['Builder Referral Fees']);
      }
    }
  });
}

for (const field of ['total_builder_fee_collected', 'total_fee_rewards']) {
  for (const invalid of [undefined, null, '', '-1', 'NaN', 'Infinity', 42]) {
    test(`Dream rejects ${field}=${String(invalid)}`, async (context) => {
      context.mock.method(axios, 'get', async () => ({
        status: 200,
        data: { result: {
          total_builder_fee_collected: '12.5',
          total_fee_rewards: '3.25',
          [field]: invalid,
        } },
      }));
      await assert.rejects(adapter.adapter![CHAIN.LYRA].fetch!(options), new RegExp(`Invalid Derive ${field}`));
    });
  }
}

test('Dream propagates Derive request failures', async (context) => {
  context.mock.method(axios, 'get', async () => {
    throw new Error('Derive unavailable');
  });
  await assert.rejects(adapter.adapter![CHAIN.LYRA].fetch!(options), /Derive unavailable/);
});
