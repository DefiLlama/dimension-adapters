import BigNumber from 'bignumber.js';
import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { httpGet } from '../utils/fetchURL';
import { amount, API, equal, HOUR } from '../dexs/uxuy-perps-v2';

const fetch = async (options: FetchOptions) => {
  const endMs = Math.round(options.endTimestamp / HOUR) * HOUR * 1000;
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
};

const adapter: SimpleAdapter = {
  version: 2,
  // OI is a stock: the hourly flow aggregator would incorrectly sum 24 snapshots.
  pullHourly: false,
  chains: [CHAIN.OFF_CHAIN],
  // First published hourly snapshot: 2026-10-26 12:00 UTC; no earlier history is backfilled.
  start: '2026-10-26',
  fetch,
  methodology: {
    OpenInterest: 'Total absolute position value, equal to long plus short USD value, from the published snapshot for the period-end UTC hour. Collection starts on the hour and completes later; this is an hourly observation. Missing hours are not replaced with stale latest values.',
  },
};

export default adapter;
