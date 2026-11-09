import BigNumber from 'bignumber.js';
import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { httpGet } from '../utils/fetchURL';

// UXUY's self-operated venue matches off-chain; these BSC custody contracts do not contain its trade ledger.
// https://www.uxuy.com/liquidity-provider
// Hot vault: 0x6008F2720fb9456dB6d9B5EEeEDBf88072adAb10
// Cold vault: 0x5BcF7Ec138e8944a6d143576139dBecDfc986051
// UUSD: 0x61a10E8556BEd032eA176330e7F17D6a12a10000
export const API = 'https://smart-dash-api.uxuy.me/shot_gw/v1/public/perps';
export const HOUR = 3600;

export function amount(value: unknown, field: string): BigNumber {
  if (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value))
    throw new Error(`UXUY: invalid ${field}`);
  const result = new BigNumber(value);
  if (!Number.isFinite(result.toNumber())) throw new Error(`UXUY: out-of-range ${field}`);
  return result;
}

export function equal(actual: BigNumber, expected: BigNumber, field: string) {
  if (!actual.eq(expected)) throw new Error(`UXUY: inconsistent ${field}`);
}

function windowOf(options: FetchOptions) {
  // The API takes UTC-hour bounds; runner bounds sit a second or so off the hour, so round each to the nearest hour.
  const start = Math.round(options.startTimestamp / HOUR) * HOUR;
  const end = Math.round(options.endTimestamp / HOUR) * HOUR;
  if (end <= start || end - start > 86400 || end * 1000 > Date.now())
    throw new Error('UXUY: expected an ended UTC-hour window of at most 24 hours');
  return { startMs: start * 1000, endMs: end * 1000 };
}

const fetch = async (options: FetchOptions) => {
  const { startMs, endMs } = windowOf(options);
  const data = await httpGet(`${API}/metrics?start_time_ms=${startMs}&end_time_ms=${endMs}`, { timeout: 30000 });
  if (data?.complete !== true || String(data.start_time_ms) !== String(startMs)
    || String(data.end_time_ms) !== String(endMs) || data.data_basis !== 'order_snapshot'
    || data.attribution_time_field !== 'update_time_ms' || !Array.isArray(data.assets))
    throw new Error('UXUY: incomplete metrics or unexpected window/source');
  if (data.revenue_complete !== true) throw new Error('UXUY: revenue is not confirmed');

  const seen = new Set<string>();
  let volume = new BigNumber(0), fees = new BigNumber(0), revenue = new BigNumber(0), commission = new BigNumber(0);
  for (const asset of data.assets) {
    if (!asset || !['USDT', 'UUSD'].includes(asset.quote_asset) || seen.has(asset.quote_asset))
      throw new Error('UXUY: unsupported or duplicate quote asset');
    seen.add(asset.quote_asset);
    if (asset.revenue_complete !== true) throw new Error('UXUY: asset revenue is not confirmed');
    const usd = amount(asset.volume_usd, 'asset volume_usd');
    equal(usd, amount(asset.volume_quote, 'volume_quote'), '1:1 quote volume');
    // total_fee_usd includes extra liquidation fees; only open/close fees belong to this metric.
    const tradingFees = amount(asset.open_fee_quote, 'open_fee_quote').plus(amount(asset.close_fee_quote, 'close_fee_quote'));
    const retained = amount(asset.revenue_usd, 'asset revenue_usd');
    const referral = amount(asset.commission_usd, 'asset commission_usd');
    equal(retained, amount(asset.revenue_quote, 'revenue_quote'), '1:1 quote revenue');
    equal(referral, amount(asset.commission_quote, 'commission_quote'), '1:1 quote commission');
    equal(tradingFees, retained.plus(referral), 'fees = revenue + commission');
    volume = volume.plus(usd);
    fees = fees.plus(tradingFees);
    revenue = revenue.plus(retained);
    commission = commission.plus(referral);
  }
  equal(volume, amount(data.volume_usd, 'volume_usd'), 'total volume');
  equal(revenue, amount(data.revenue_usd, 'revenue_usd'), 'total revenue');
  equal(commission, amount(data.commission_usd, 'commission_usd'), 'total commission');

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  // SDK Balances treats strings as integer token units; convert only after exact decimal validation.
  dailyVolume.addUSDValue(volume.toNumber());
  dailyFees.addUSDValue(fees.toNumber(), 'Open/Close Fees');
  dailyRevenue.addUSDValue(revenue.toNumber(), 'Open/Close Fees To Protocol');
  dailySupplySideRevenue.addUSDValue(commission.toNumber(), 'Open/Close Fees To Referrers');
  // The API does not expose treasury/tokenholder allocations; do not invent that optional split.
  return { dailyVolume, dailyFees, dailyRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.OFF_CHAIN],
  // First trades 2026-07-06 10:00 UTC, but the source never confirmed revenue for that hour ($767 volume); 07-07 is the first full day.
  start: '2026-07-07',
  fetch,
  methodology: {
    Volume: 'Executed-order notional (executed price times executed quantity) on UXUY self-operated perps, attributed by order update time. USDT and UUSD use the venue\'s 1:1 USD accounting convention. Excludes UXUY\'s earlier Hyperliquid builder-code trading, which is listed separately as UXUY Perps.',
    Fees: 'Opening and closing trading fees on UXUY self-operated perps, excluding extra liquidation fees, attributed by order update time. USDT and UUSD use the venue\'s 1:1 USD accounting convention.',
    Revenue: 'Opening and closing fees less actual referral commissions.',
    SupplySideRevenue: 'Actual referral commissions deducted from opening and closing fees.',
  },
  breakdownMethodology: {
    Fees: { 'Open/Close Fees': 'Trading fees for opening and closing positions; extra liquidation fees are excluded.' },
    Revenue: { 'Open/Close Fees To Protocol': 'Opening and closing fees retained after actual referral commissions.' },
    SupplySideRevenue: { 'Open/Close Fees To Referrers': 'Actual commissions allocated to referrers.' },
  },
};

export default adapter;
