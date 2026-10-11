import assert from 'node:assert/strict';
import { test, TestContext } from 'node:test';
import axios from 'axios';
import { Balances, ChainApi } from '@defillama/sdk';
import { FetchOptions, FetchResponseValue } from '../adapters/types';
import feesAdapter from '../fees/dreaming';
import optionsAdapter from '../options/dreaming';
import { CHAIN } from './chains';

function options(chain: string): FetchOptions {
  const fromTimestamp = 1768953600;
  const toTimestamp = fromTimestamp + 86400;
  const api = new ChainApi({ chain });
  const unused = async (): Promise<never> => { throw new Error('Unexpected chain access'); };
  return {
    chain, api, fromApi: api, toApi: api,
    fromTimestamp, toTimestamp, startTimestamp: fromTimestamp, endTimestamp: toTimestamp,
    startOfDay: fromTimestamp, dateString: '2026-01-21', moduleUID: 'dreaming-test',
    createBalances: () => new Balances({ chain }),
    getBlock: unused, getLogs: unused, streamLogs: unused,
    getFromBlock: unused, getToBlock: unused, getStartBlock: unused, getEndBlock: unused,
  };
}

function mockResponse(t: TestContext, data: unknown, expectedUrl: string) {
  const original = axios.defaults.adapter;
  t.after(() => { axios.defaults.adapter = original; });
  axios.defaults.adapter = async (config) => {
    assert.equal(config.url, expectedUrl);
    return { data, status: 200, statusText: 'OK', headers: {}, config };
  };
}

function usd(value: FetchResponseValue | undefined): number {
  assert.ok(value instanceof Balances);
  return Number(value.getBalances()['coingecko:tether'] ?? 0);
}

const referralUrl = 'https://api.lyra.finance/public/get_referral_performance?start_ms=1768953600000&end_ms=1769040000000&referral_code=dream';
const statsUrl = 'https://api.dos.app/public/defillama/daily?date=2026-01-21';

async function legacyFees() {
  const fetch = feesAdapter.adapter?.[CHAIN.LYRA].fetch;
  assert.ok(fetch);
  return fetch(options(CHAIN.LYRA));
}

test('legacy fees and revenue count builder income plus referral rewards, not venue fees', async (t) => {
  mockResponse(t, { result: {
    total_referred_fees: '1113.30', total_fee_rewards: '12.50', total_builder_fee_collected: '288.71',
  } }, referralUrl);
  const result = await legacyFees();
  assert.equal(usd(result.dailyFees), 301.21);
  assert.equal(usd(result.dailyRevenue), 301.21);
  assert.equal(usd(result.dailyProtocolRevenue), 301.21);
});

test('a quiet legacy day reports zero income', async (t) => {
  mockResponse(t, { result: {
    total_referred_fees: '0', total_fee_rewards: '0', total_builder_fee_collected: '0',
  } }, referralUrl);
  const result = await legacyFees();
  assert.equal(usd(result.dailyFees), 0);
  assert.equal(usd(result.dailyRevenue), 0);
});

for (const value of [undefined, null, '', 'invalid', '-1', 'Infinity']) {
  test(`legacy income rejects invalid builder fees: ${String(value)}`, async (t) => {
    mockResponse(t, { result: {
      total_referred_fees: '100', total_fee_rewards: '1', total_builder_fee_collected: value,
    } }, referralUrl);
    await assert.rejects(legacyFees, /total_builder_fee_collected/);
  });
}

test('brokerage revenue subtracts referral payouts from opening fees', async (t) => {
  mockResponse(t, { feesUsd: '2030.44', referralSharedUsd: '29.21' }, statsUrl);
  const fetch = feesAdapter.adapter?.[CHAIN.OFF_CHAIN].fetch;
  assert.ok(fetch);
  const result = await fetch(options(CHAIN.OFF_CHAIN));
  assert.equal(usd(result.dailyFees), 2030.44);
  assert.equal(usd(result.dailyUserFees), 2030.44);
  assert.equal(usd(result.dailySupplySideRevenue), 29.21);
  assert.equal(usd(result.dailyRevenue), 2001.23);
});

test('options preserve total notional including estimates and executed premium', async (t) => {
  mockResponse(t, {
    notionalUsd: '44646.22', notionalVerifiedUsd: '0.00', notionalEstimatedUsd: '44646.22', premiumUsd: '27.86',
  }, statsUrl);
  assert.ok(optionsAdapter.fetch);
  const result = await optionsAdapter.fetch(options(CHAIN.OFF_CHAIN));
  assert.equal(result.dailyNotionalVolume, '44646.22');
  assert.equal(result.dailyPremiumVolume, '27.86');
});
