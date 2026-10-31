import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Balances } from '@defillama/sdk';
import type { FetchOptions, FetchV2 } from '../adapters/types';
import volumeAdapter from '../dexs/uxuy-perps';
import feesAdapter from '../fees/uxuy-perps';
import oiAdapter from '../open-interest/uxuy-perps';
import { importAdapter } from '../adapters/utils/importAdapter';

const http = require('../utils/fetchURL');
const volumeFetch = volumeAdapter.fetch as FetchV2;
const feesFetch = feesAdapter.fetch as FetchV2;
const oiFetch = oiAdapter.fetch as FetchV2;
const END = Date.UTC(2026, 9, 29) / 1000;

function fixture() {
  const options = {
    startTimestamp: END - 3601, endTimestamp: END,
    createBalances: () => new Balances({ chain: 'off_chain' }),
  } as FetchOptions;
  const asset = {
    quote_asset: 'USDT', volume_quote: '9007199254740993.123456789', volume_usd: '9007199254740993.123456789',
    open_fee_quote: '60.25', close_fee_quote: '39.75', liquidation_fee_quote: '500', total_fee_usd: '600',
    commission_quote: '20', commission_usd: '20', revenue_quote: '80', revenue_usd: '80', revenue_complete: true,
  };
  const metrics = {
    start_time_ms: String((END - 3600) * 1000), end_time_ms: String(END * 1000),
    complete: true, revenue_complete: true, data_basis: 'order_snapshot', attribution_time_field: 'update_time_ms',
    volume_usd: asset.volume_usd, total_fee_usd: '600', commission_usd: '20', revenue_usd: '80', assets: [asset],
  };
  const snapshot = {
    snapshot_time_ms: String(END * 1000), frequency: '1h', scope: 'full_eoa_regular_accounts',
    calculation_basis: 'sum_abs_position_value', complete: false, quality: 'degraded',
    total_oi_usd: '1000.123456789', long_oi_usd: '900', short_oi_usd: '100.123456789',
  };
  const history = { snapshots: [snapshot], next_cursor: '' };
  return { options, asset, metrics, snapshot, history };
}

function usd(value: unknown) {
  return String((value as Balances).getBalances()['coingecko:tether'] ?? '0');
}

test('real volume fetch maps USD values and accepts published degraded OI', async (t) => {
  const { options, metrics, history } = fixture();
  const requests: string[] = [];
  t.mock.method(http, 'httpGet', async (url: string) => {
    requests.push(url);
    return url.includes('/metrics?') ? metrics : history;
  });
  const result = { ...await volumeFetch(options), ...await oiFetch(options) };
  assert.equal(usd(result.dailyVolume), String(Number(metrics.volume_usd)));
  assert.equal(usd(result.openInterestAtEnd), '1000.123456789');
  assert.equal(usd(result.longOpenInterestAtEnd), '900');
  assert.equal(usd(result.shortOpenInterestAtEnd), '100.123456789');
  assert.match(requests[0], new RegExp(`start_time_ms=${(END - 3600) * 1000}&end_time_ms=${END * 1000}$`));
  assert.match(requests[1], new RegExp(`start_time_ms=${END * 1000}&end_time_ms=${(END + 3600) * 1000}&limit=1$`));
});

test('fees and revenue share one request, exclude liquidation fees and retain actual referral split', async (t) => {
  const { options, metrics } = fixture();
  let calls = 0;
  t.mock.method(http, 'httpGet', async () => { calls++; return metrics; });
  const result = await feesFetch(options);
  assert.equal(calls, 1);
  assert.equal(usd(result.dailyFees), '100');
  assert.equal(usd(result.dailyRevenue), '80');
  assert.equal(usd(result.dailySupplySideRevenue), '20');
  assert.notEqual(result.dailyFees, result.dailyRevenue);
});

test('sums supported quote assets without losing fractional fees', async (t) => {
  const { options, metrics, asset } = fixture();
  metrics.assets.push({ ...asset, quote_asset: 'UUSD', volume_quote: '0.000000001', volume_usd: '0.000000001',
    open_fee_quote: '0.000000001', close_fee_quote: '0', commission_quote: '0', commission_usd: '0',
    revenue_quote: '0.000000001', revenue_usd: '0.000000001' });
  metrics.volume_usd = '9007199254740993.12345679';
  metrics.revenue_usd = '80.000000001';
  t.mock.method(http, 'httpGet', async () => metrics);
  const result = await feesFetch(options);
  assert.equal(usd(result.dailyFees), '100.000000001');
  assert.equal(usd(result.dailyRevenue), '80.000000001');
});

test('confirmed empty windows return zero', async (t) => {
  const { options, metrics, history } = fixture();
  metrics.assets = [];
  metrics.volume_usd = metrics.commission_usd = metrics.revenue_usd = '0';
  history.snapshots = [];
  t.mock.method(http, 'httpGet', async (url: string) => url.includes('/metrics?') ? metrics : history);
  const fees = await feesFetch(options);
  assert.equal(usd(fees.dailyFees), '0');
  assert.equal(usd(fees.dailyRevenue), '0');
  const volume = await volumeFetch(options);
  assert.equal(usd(volume.dailyVolume), '0');
  assert.equal(volume.openInterestAtEnd, undefined);
});

test('unconfirmed revenue defaults cannot become real zero, while volume remains available', async (t) => {
  const { options, metrics, history } = fixture();
  metrics.revenue_complete = false;
  metrics.revenue_usd = '0';
  t.mock.method(http, 'httpGet', async (url: string) => url.includes('/metrics?') ? metrics : history);
  await assert.rejects(feesFetch(options), /revenue is not confirmed/);
  assert.equal(usd((await volumeFetch(options)).dailyVolume), String(Number(metrics.volume_usd)));
});

test('accepts the exact one-second server refill convention without duplicating adjacent hours', async (t) => {
  const { options, metrics } = fixture();
  const windows: string[] = [];
  t.mock.method(http, 'httpGet', async (url: string) => {
    const query = new URL(url).searchParams;
    windows.push(`${query.get('start_time_ms')},${query.get('end_time_ms')}`);
    return { ...metrics, start_time_ms: query.get('start_time_ms'), end_time_ms: query.get('end_time_ms') };
  });
  options.startTimestamp--;
  options.endTimestamp--;
  await feesFetch(options);
  options.startTimestamp += 3600;
  options.endTimestamp += 3600;
  await feesFetch(options);
  assert.deepEqual(windows, [`${(END - 3600) * 1000},${END * 1000}`, `${END * 1000},${(END + 3600) * 1000}`]);
});

test('rejects arbitrary unaligned windows before making an HTTP request', async (t) => {
  const { options } = fixture();
  options.startTimestamp -= 30;
  options.endTimestamp -= 30;
  t.mock.method(http, 'httpGet', async () => { throw new Error('unexpected HTTP'); });
  await assert.rejects(feesFetch(options), /ended UTC-hour window/);
});

for (const scenario of ['complete', 'window', 'source', 'asset', 'duplicate', 'volume', 'missing', 'negative', 'unconfirmed asset', 'split', 'total revenue']) {
  test(`rejects malformed or inconsistent metrics: ${scenario}`, async (t) => {
    const { options, metrics, asset } = fixture();
    switch (scenario) {
      case 'complete': metrics.complete = false; break;
      case 'window': metrics.start_time_ms = '1'; break;
      case 'source': metrics.data_basis = 'other'; break;
      case 'asset': asset.quote_asset = 'ETH'; break;
      case 'duplicate': metrics.assets.push({ ...asset }); break;
      case 'volume': metrics.volume_usd = '1'; break;
      case 'missing': delete (asset as any).open_fee_quote; break;
      case 'negative': asset.revenue_usd = '-1'; break;
      case 'unconfirmed asset': asset.revenue_complete = false; break;
      case 'split': asset.revenue_quote = asset.revenue_usd = '79'; break;
      case 'total revenue': metrics.revenue_usd = '79'; break;
    }
    t.mock.method(http, 'httpGet', async () => metrics);
    await assert.rejects(feesFetch(options), /UXUY:/);
  });
}

for (const scenario of ['missing', 'stale', 'bad sum', 'HTTP failure']) {
  test(`separate OI ${scenario} fails its own pull without affecting volume`, async (t) => {
    const { options, metrics, history, snapshot } = fixture();
    if (scenario === 'missing') history.snapshots = [];
    if (scenario === 'stale') snapshot.snapshot_time_ms = String((END - 3600) * 1000);
    if (scenario === 'bad sum') snapshot.total_oi_usd = '1';
    t.mock.method(http, 'httpGet', async (url: string) => {
      if (url.includes('/metrics?')) return metrics;
      if (scenario === 'HTTP failure') throw new Error('HTTP 500');
      return history;
    });
    const result = await volumeFetch(options);
    assert.equal(usd(result.dailyVolume), String(Number(metrics.volume_usd)));
    assert.equal(result.openInterestAtEnd, undefined);
    await assert.rejects(oiFetch(options));
  });
}

test('metrics HTTP failures reject instead of publishing zero', async (t) => {
  const { options } = fixture();
  t.mock.method(http, 'httpGet', async () => { throw new Error('HTTP 500'); });
  await assert.rejects(feesFetch(options), /HTTP 500/);
  await assert.rejects(volumeFetch(options), /HTTP 500/);
});

test('validates sub-integer differences above Number.MAX_SAFE_INTEGER before SDK conversion', async (t) => {
  const { options, metrics } = fixture();
  metrics.volume_usd = '9007199254740993.123456788';
  t.mock.method(http, 'httpGet', async () => metrics);
  await assert.rejects(volumeFetch(options), /inconsistent total volume/);
});

test('OI is a standalone snapshot and maps non-hourly runner ends to the observed hour', async (t) => {
  const { options, history } = fixture();
  assert.equal(oiAdapter.pullHourly, false);
  options.endTimestamp += 1234;
  t.mock.method(http, 'httpGet', async (url: string) => {
    assert.equal(new URL(url).searchParams.get('start_time_ms'), String(END * 1000));
    return history;
  });
  assert.equal(usd((await oiFetch(options)).openInterestAtEnd), '1000.123456789');
  options.endTimestamp = END - 1;
  assert.equal(usd((await oiFetch(options)).openInterestAtEnd), '1000.123456789');
});

test('existing uxuy-perps slug resolves to the new adapters and no longer exposes the stopped builder', async () => {
  const factory = require('../factory/hyperliquid');
  assert.equal(factory.protocolList.includes('uxuy-perps'), false);
  assert.equal(factory.getAdapter('uxuy-perps'), undefined);
  for (const [type, adapter] of [['dexs', volumeAdapter], ['fees', feesAdapter], ['open-interest', oiAdapter]] as const) {
    const result = await importAdapter(type, 'uxuy-perps', `${process.cwd()}/${type}/uxuy-perps`);
    assert.equal(result.source, 'file');
    assert.equal(result.adapter, adapter);
  }
});
