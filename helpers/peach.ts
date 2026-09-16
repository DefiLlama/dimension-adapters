import { FetchOptions } from '../adapters/types';
import { httpGet } from '../utils/fetchURL';

// Indexed Arc mainnet events, with historical [startTimestamp, endTimestamp) queries.
// The response includes raw token amounts and persisted USD valuations for reconciliation.
// Public deployment: https://api.peach.ag/arc/v1/launchpad/config
// Launchpad factory: 0x7E462d220b6b0a4c55B205B613133dc1C1Cc9dC1
// Fee escrow: 0x29Ad26C48267B791DC2f6A2D4f3Fd819E6301540
// Router fills: https://api.peach.ag/arc/v1/arc/swap/events
const API = 'https://api.peach.ag/arc/v1/defillama';

// Reporting begins on this UTC date, as selected by the protocol team.
export const aggregatorStart = '2026-09-16';
export const launchpadStart = '2026-09-16';

export interface Amounts {
  volume_usd: string;
  fees_usd: string;
  revenue_usd: string;
  creator_usd: string;
  partner_usd: string;
  referrer_usd: string;
  buyback_usd: string;
  usd_complete: boolean;
  unpriced_records: number;
  source: 'aggregator' | 'bonding' | 'dex';
  asset: string;
  volume_raw: string;
  fees_raw: string;
  revenue_raw: string;
  creator_raw: string;
  partner_raw: string;
  referrer_raw: string;
  buyback_raw: string;
}

const usdKeys = ['volume_usd', 'fees_usd', 'revenue_usd', 'creator_usd', 'partner_usd', 'referrer_usd', 'buyback_usd'] as const;
const amountKeys = ['volume_raw', 'fees_raw', 'revenue_raw', 'creator_raw', 'partner_raw', 'referrer_raw', 'buyback_raw'] as const;

/** Fetch mainnet event totals and reject incomplete pricing or inconsistent allocations. */
export async function getPeachAmounts(options: FetchOptions, product: 'aggregator' | 'launchpad'): Promise<Amounts[]> {
  const response = await httpGet(`${API}/${product}?fromTimestamp=${options.startTimestamp}&toTimestamp=${options.endTimestamp}`);
  const data = response?.data;
  if (response?.code !== 0 || !data || data.chain !== 'arc' || data.chain_id !== '5042' || data.network !== 'arc-mainnet'
    || data.from_timestamp !== options.startTimestamp || data.to_timestamp !== options.endTimestamp || !Array.isArray(data.amounts)) {
    throw new Error('Peach returned an invalid report, time range, or mainnet identity');
  }
  const methodology = product === 'aggregator' ? 'pds_max_side_snapshot_v1' : 'launchpad_usdc_parity_execution_v1';
  if (data.usd_methodology !== methodology || data.usd_complete !== true || data.unpriced_records !== 0
    || data.fees_measured !== (product === 'launchpad')) {
    throw new Error('Peach USD report is incomplete or uses an unexpected valuation methodology');
  }
  validateUSD(data);
  const seen = new Set<string>();
  for (const row of data.amounts) {
    const sources = product === 'aggregator' ? ['aggregator'] : ['bonding', 'dex'];
    if (!sources.includes(row.source) || typeof row.asset !== 'string' || !/^0x[0-9a-f]{40}$/.test(row.asset)) {
      throw new Error('Peach returned an invalid source or asset');
    }
    if (row.usd_complete !== true || row.unpriced_records !== 0) throw new Error('Peach returned unpriced source records');
    validateUSD(row);
    const key = `${row.source}:${row.asset}`;
    if (seen.has(key)) throw new Error('Peach returned a duplicate source/asset');
    seen.add(key);
    for (const field of amountKeys) {
      if (typeof row[field] !== 'string' || !/^\d+$/.test(row[field])) throw new Error(`Peach returned an invalid ${field}`);
    }
    const split = BigInt(row.revenue_raw) + BigInt(row.creator_raw) + BigInt(row.partner_raw) + BigInt(row.referrer_raw) + BigInt(row.buyback_raw);
    if (split !== BigInt(row.fees_raw)) throw new Error('Peach fee allocations do not reconcile');
  }
  for (const field of usdKeys) {
    if (!equalSum(data[field], data.amounts.map((row: Amounts) => row[field]))) throw new Error(`Peach ${field} total does not reconcile`);
  }
  return data.amounts;
}

// Validate decimal strings exactly before converting USD to the SDK's numeric format.
// addUSDValue treats strings as integer balances. Raw token amounts stay as strings
// and are never repriced by the SDK; missing USD is an error.
function validateUSD(row: Record<string, any>) {
  for (const field of usdKeys) {
    const value = row[field];
    if (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value) || !Number.isFinite(Number(value))
      || (Number(value) === 0 && /[1-9]/.test(value))) throw new Error(`Peach returned an invalid ${field}`);
  }
  if (!equalSum(row.fees_usd, [row.revenue_usd, row.creator_usd, row.partner_usd, row.referrer_usd, row.buyback_usd])) {
    throw new Error('Peach USD fee allocations do not reconcile');
  }
}

// Decimal-string arithmetic keeps validation exact above Number.MAX_SAFE_INTEGER.
function equalSum(total: string, parts: string[]): boolean {
  const scale = Math.max(...[total, ...parts].map(v => (v.split('.')[1] || '').length));
  const atomic = (v: string) => {
    const [whole, fraction = ''] = v.split('.');
    return BigInt(whole + fraction.padEnd(scale, '0'));
  };
  return atomic(total) === parts.reduce((sum, part) => sum + atomic(part), BigInt(0));
}
