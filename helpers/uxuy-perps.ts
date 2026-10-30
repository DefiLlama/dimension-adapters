import BigNumber from 'bignumber.js';
import { FetchOptions } from '../adapters/types';
import { httpGet } from '../utils/fetchURL';

// UXUY's self-operated venue matches off-chain; these BSC custody contracts do not contain its trade ledger.
// https://www.uxuy.com/liquidity-provider
// Hot vault: 0x6008F2720fb9456dB6d9B5EEeEDBf88072adAb10
// Cold vault: 0x5BcF7Ec138e8944a6d143576139dBecDfc986051
// UUSD: 0x61a10E8556BEd032eA176330e7F17D6a12a10000
const API = 'https://smart-dash-api.uxuy.me/shot_gw/v1/public/perps';
const HOUR = 3600;

function amount(value: unknown, field: string): BigNumber {
  if (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value))
    throw new Error(`UXUY: invalid ${field}`);
  const result = new BigNumber(value);
  if (!Number.isFinite(result.toNumber())) throw new Error(`UXUY: out-of-range ${field}`);
  return result;
}

function equal(actual: BigNumber, expected: BigNumber, field: string) {
  if (!actual.eq(expected)) throw new Error(`UXUY: inconsistent ${field}`);
}

export function windowOf(options: FetchOptions) {
  // The runner starts one second before the logical window. Server refills also use
  // HH:59:59 as the end; restore only that exact boundary convention, never arbitrary rounding.
  const rawEnd = options.endTimestamp;
  const end = rawEnd % HOUR === HOUR - 1 ? rawEnd + 1 : rawEnd;
  const duration = rawEnd - options.startTimestamp - 1;
  const start = end - duration;
  if (![start, end].every(Number.isSafeInteger) || start < 0 || start % HOUR || end % HOUR
    || duration <= 0 || duration > 86400 || end * 1000 > Date.now())
    throw new Error('UXUY: expected an ended UTC-hour window of at most 24 hours');
  return { startMs: start * 1000, endMs: end * 1000 };
}

export async function getMetrics(options: FetchOptions) {
  const { startMs, endMs } = windowOf(options);
  const data = await httpGet(`${API}/metrics?start_time_ms=${startMs}&end_time_ms=${endMs}`, { timeout: 30000 });
  if (data?.complete !== true || String(data.start_time_ms) !== String(startMs)
    || String(data.end_time_ms) !== String(endMs) || data.data_basis !== 'order_snapshot'
    || data.attribution_time_field !== 'update_time_ms' || !Array.isArray(data.assets))
    throw new Error('UXUY: incomplete metrics or unexpected window/source');

  const seen = new Set<string>();
  let volume = new BigNumber(0);
  for (const asset of data.assets) {
    if (!asset || !['USDT', 'UUSD'].includes(asset.quote_asset) || seen.has(asset.quote_asset))
      throw new Error('UXUY: unsupported or duplicate quote asset');
    seen.add(asset.quote_asset);
    const usd = amount(asset.volume_usd, 'asset volume_usd');
    equal(usd, amount(asset.volume_quote, 'volume_quote'), '1:1 quote volume');
    volume = volume.plus(usd);
  }
  equal(volume, amount(data.volume_usd, 'volume_usd'), 'total volume');
  return data;
}

export function getFeeAmounts(data: Awaited<ReturnType<typeof getMetrics>>) {
  if (data.revenue_complete !== true) throw new Error('UXUY: revenue is not confirmed');
  let fees = new BigNumber(0), revenue = new BigNumber(0), commission = new BigNumber(0);
  for (const asset of data.assets) {
    if (asset.revenue_complete !== true) throw new Error('UXUY: asset revenue is not confirmed');
    // total_fee_usd includes extra liquidation fees; only open/close fees belong to this metric.
    const tradingFees = amount(asset.open_fee_quote, 'open_fee_quote').plus(amount(asset.close_fee_quote, 'close_fee_quote'));
    const retained = amount(asset.revenue_usd, 'asset revenue_usd');
    const referral = amount(asset.commission_usd, 'asset commission_usd');
    equal(retained, amount(asset.revenue_quote, 'revenue_quote'), '1:1 quote revenue');
    equal(referral, amount(asset.commission_quote, 'commission_quote'), '1:1 quote commission');
    equal(tradingFees, retained.plus(referral), 'fees = revenue + commission');
    fees = fees.plus(tradingFees);
    revenue = revenue.plus(retained);
    commission = commission.plus(referral);
  }
  equal(revenue, amount(data.revenue_usd, 'revenue_usd'), 'total revenue');
  equal(commission, amount(data.commission_usd, 'commission_usd'), 'total commission');
  // SDK Balances treats strings as integer token units; convert only after exact decimal validation.
  return { fees: fees.toNumber(), revenue: revenue.toNumber(), commission: commission.toNumber() };
}

export async function getOpenInterest(options: FetchOptions) {
  const rawEnd = options.endTimestamp;
  if (!Number.isSafeInteger(rawEnd) || rawEnd < 0 || rawEnd * 1000 > Date.now())
    throw new Error('UXUY: invalid OI period end');
  const logicalEnd = rawEnd % HOUR === HOUR - 1 ? rawEnd + 1 : rawEnd;
  // A snapshot source observes hourly: use the period-end hour, not a sum of hourly stocks.
  const endMs = Math.floor(logicalEnd / HOUR) * HOUR * 1000;
  const data = await httpGet(`${API}/open-interest/history?start_time_ms=${endMs}&end_time_ms=${endMs + HOUR * 1000}&limit=1`, { timeout: 30000 });
  if (!Array.isArray(data?.snapshots)) throw new Error('UXUY: invalid OI history');
  const snapshot = data.snapshots.find((row: any) => String(row.snapshot_time_ms) === String(endMs));
  if (!snapshot) throw new Error(`UXUY: no OI snapshot for ${new Date(endMs).toISOString()}`);
  if (snapshot.frequency !== '1h' || snapshot.scope !== 'full_eoa_regular_accounts'
    || snapshot.calculation_basis !== 'sum_abs_position_value') throw new Error('UXUY: unexpected OI source');
  // Published snapshots remain usable when the source marks individual-address failures as degraded.
  const total = amount(snapshot.total_oi_usd, 'total_oi_usd');
  const long = amount(snapshot.long_oi_usd, 'long_oi_usd');
  const short = amount(snapshot.short_oi_usd, 'short_oi_usd');
  equal(total, long.plus(short), 'OI = long + short');
  const balance = (value: BigNumber) => {
    const result = options.createBalances();
    result.addUSDValue(value.toNumber());
    return result;
  };
  return { openInterestAtEnd: balance(total), longOpenInterestAtEnd: balance(long), shortOpenInterestAtEnd: balance(short) };
}
