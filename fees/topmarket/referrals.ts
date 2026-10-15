import { Interface } from 'ethers';
import { getProvider } from '@defillama/sdk';
import { httpGet } from '../../utils/fetchURL';
import { FetchOptions } from '../../adapters/types';
import { Context, Entry, events } from './accounting';
import { MARKET, MARKET_BLOCK, REFERRAL_COVERAGE_END, USDC } from './config';

// Off-chain final entitlements have no accrual event; withdrawal transfers are
// not a substitute. Only this leg uses the public history API. Sources remain
// inspectable by Base tx/log coordinates; all user-paid fees still come from logs.
const ENDPOINT = 'https://api.top.market/api/defillama/referrals';
export interface Referral {
  event_id: string; settled_at: number; source_type: string; chain_id: number;
  tx_hash: string; log_index: number; block_number: number; box_address: string;
  token: string; decimals: number; amount_raw: string; gross_amount_raw: string;
  refunded_amount_raw: string; rate_bps: number; box_multiplier: string;
  settled_cutoff_block: number; entry_type: string;
}
function fail(reason: string): never { throw new Error(`TopMarket: referral ${reason}`); }
const integer = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
const raw = (s: unknown): bigint => {
  if (typeof s !== 'string' || !/^(0|[1-9][0-9]{0,77})$/.test(s)) fail('invalid base-unit amount');
  return BigInt(s as string);
};

export function validateReferral(r: Referral, start: number, end: number) {
  if (!r || typeof r !== 'object' || !/^r_[0-9a-f]{32}$/.test(r.event_id) ||
      !integer(r.settled_at) || r.settled_at < start || r.settled_at >= end ||
      r.chain_id !== 8453 || r.token !== USDC || r.decimals !== 6 || r.entry_type !== 'credit' ||
      !['pack_purchase', 'marketplace_trade', 'auction_trade'].includes(r.source_type) ||
      !/^0x[0-9a-f]{64}$/.test(r.tx_hash) || !integer(r.log_index) ||
      !integer(r.block_number) || r.block_number === 0 || !integer(r.settled_cutoff_block) ||
      r.settled_cutoff_block < r.block_number || !integer(r.rate_bps) || r.rate_bps > 10000 ||
      typeof r.box_multiplier !== 'string' || !/^\d{1,2}(\.\d{1,4})?$/.test(r.box_multiplier) ||
      (r.source_type === 'pack_purchase' ? !/^0x[0-9a-f]{40}$/.test(r.box_address) : r.box_address !== ''))
    fail('invalid settlement row');
  const gross = raw(r.gross_amount_raw), refund = raw(r.refunded_amount_raw), amount = raw(r.amount_raw);
  const [whole, fraction = ''] = r.box_multiplier.split('.');
  const multiplier = BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, '0'));
  // SettlePending rounds each final net commission to the nearest USDC cent
  // (PostgreSQL ROUND, half up), not floor(base units), before aggregation.
  const expected = ((gross - refund) * BigInt(r.rate_bps) * multiplier + 500000000000n) / 1000000000000n * 10000n;
  if (gross <= 0n || refund > gross || amount <= 0n || amount !== expected) fail('settlement amount mismatch');
}

// Injectable getter is only for deterministic tests; production always uses the
// literal public URL above, no private key/config/database is required.
export async function loadReferrals(start: number, end: number, get = (url: string) => httpGet(url, { timeout: 15000 })) {
  if (!integer(start) || !integer(end) || end <= start) fail('invalid window');
  if (end <= REFERRAL_COVERAGE_END) return [] as Referral[];
  start = Math.max(start, REFERRAL_COVERAGE_END);
  if (end - start > 86400) fail('public API window exceeds 24 hours');
  const rows: Referral[] = [], seen = new Set<string>();
  let cursor: { settled_at: number; event_id: string } | null = null;
  for (let page = 0; page < 100; page++) {
    const url = `${ENDPOINT}?from=${start}&to=${end}` + (cursor ? `&after_at=${cursor.settled_at}&after_id=${cursor.event_id}` : '');
    const p = await get(url); // Missing/stale/503 is an error, never zero referrals.
    if (!p || p.schema !== 'topmarket-referrals-v1' || p.recognition !== 'settled_at' || p.chain_id !== 8453 ||
        p.from_timestamp !== start || p.to_timestamp !== end || p.coverage?.complete !== true ||
        p.coverage.revision !== 'settled-v1' || !integer(p.coverage.from_timestamp) ||
        p.coverage.from_timestamp > start || !integer(p.coverage.through_timestamp) ||
        p.coverage.through_timestamp < end || !Array.isArray(p.entries) || p.entries.length > 500)
      fail('public coverage missing or response window mismatch');
    let previous = cursor;
    for (const r of p.entries as Referral[]) {
      validateReferral(r, start, end);
      if (seen.has(r.event_id) || (previous && (r.settled_at < previous.settled_at ||
          (r.settled_at === previous.settled_at && r.event_id <= previous.event_id)))) fail('duplicate or unordered row');
      seen.add(r.event_id); rows.push(r); previous = r;
    }
    if (p.next_cursor === null) return rows;
    if (p.entries.length !== 500 || !previous || p.next_cursor?.settled_at !== previous.settled_at ||
        p.next_cursor.event_id !== previous.event_id) fail('invalid pagination');
    cursor = p.next_cursor;
  }
  return fail('page limit exceeded; do not publish a truncated result');
}

const standard = new Interface([events.DrawRequested]);
const nonstandard = new Interface([events.TokenDrawRequested]);
const market = new Interface([events.Sold, events.OfferAccepted, events.AuctionSettled]);

export function referralEntry(r: Referral, context: Context, receipt: any): Entry {
  const log = receipt?.logs?.find((l: any) => Number(l.index ?? l.logIndex) === r.log_index);
  if (!receipt || Number(receipt.status) !== 1 || receipt.blockNumber !== r.block_number ||
      (receipt.hash ?? receipt.transactionHash)?.toLowerCase() !== r.tx_hash || !log) fail('source receipt mismatch');
  const address = String(log.address).toLowerCase();
  const box = context.boxes[address];
  const pack = r.source_type === 'pack_purchase';
  if (pack ? (!box || r.box_address !== address || box.token.toLowerCase() !== r.token) : address !== MARKET)
    fail('source outside included deployment scope');
  const parsed = (pack ? (box.kind === 'nonstandard' ? nonstandard : standard) : market).parseLog(log);
  if (!parsed || (pack ? parsed.name !== 'DrawRequested' :
      r.source_type === 'auction_trade' ? parsed.name !== 'AuctionSettled' : !['Sold', 'OfferAccepted'].includes(parsed.name)))
    fail('source event mismatch');
  if (!pack && parsed.name !== 'AuctionSettled' && String(parsed.args.currency).toLowerCase() !== r.token)
    fail('source currency mismatch');
  if (parsed.name === 'AuctionSettled') {
    const created = context.logs.find(l => l.address.toLowerCase() === MARKET && l.name === 'AuctionCreated' &&
      String(l.args.auctionId) === String(parsed.args.auctionId) && l.blockNumber <= r.block_number);
    // The settlement event omits currency. Never assume USDC from the API's
    // claimed denomination when a previous-window auction origin is missing.
    if (!created) fail('historical auction currency origin missing');
    if (String(created.args.currency).toLowerCase() !== r.token) fail('auction currency mismatch');
  }
  const gross = pack ? BigInt(parsed!.args.paid) + (box.kind === 'nonstandard' ? 0n : BigInt(parsed!.args.fee)) :
    BigInt(parsed!.args.price ?? parsed!.args.amount);
  if (gross !== BigInt(r.gross_amount_raw)) fail('source gross payment mismatch');
  return {
    event: { name: 'ReferralSettled', address, blockNumber: r.block_number, logIndex: r.log_index,
      transactionHash: r.tx_hash, timestamp: r.settled_at, args: { event_id: r.event_id } },
    token: r.token, label: pack ? 'Gacha Referrals' : 'Marketplace Referrals',
    volume: 0n, fees: 0n, supply: BigInt(r.amount_raw),
  };
}

export async function loadReferralAuctionOrigins(rows: Referral[], receipts: Map<string, any>, context: Context, getLogs: FetchOptions['getLogs']) {
  const result = { ...context, logs: [...context.logs] };
  const ids = new Set<string>();
  let toBlock = 0;
  for (const r of rows.filter(x => x.source_type === 'auction_trade')) {
    const l = receipts.get(r.tx_hash)?.logs?.find((x: any) => Number(x.index ?? x.logIndex) === r.log_index);
    if (!l || String(l.address).toLowerCase() !== MARKET) fail('auction receipt origin mismatch');
    const p = market.parseLog(l);
    if (!p || p.name !== 'AuctionSettled') fail('auction event mismatch');
    const id = String(p.args.auctionId);
    if (!context.logs.some(x => x.name === 'AuctionCreated' && x.address.toLowerCase() === MARKET && String(x.args.auctionId) === id)) ids.add(id);
    toBlock = Math.max(toBlock, r.block_number);
  }
  const iface = new Interface([events.AuctionCreated]), fragment = iface.getEvent('AuctionCreated')!;
  const missing = [...ids];
  // Only referenced historical origins, 100 indexed IDs at a time. A commission
  // can settle long after the sale, outside loadContext's normal monetary window.
  for (let i = 0; i < missing.length; i += 100) {
    const batch = missing.slice(i, i + 100);
    const logs = await getLogs({ targets: [MARKET], eventAbi: events.AuctionCreated,
      fromBlock: MARKET_BLOCK, toBlock, maxBlockRange: 90000, onlyArgs: false, entireLog: true, parseLog: true,
      topics: iface.encodeFilterTopics(fragment, [batch]) as string[] });
    for (const l of logs) {
      if (l.removed || String(l.address).toLowerCase() !== MARKET || !l.args || !l.transactionHash ||
          !integer(Number(l.blockNumber)) || Number(l.blockNumber) > toBlock || Number(l.blockNumber) < MARKET_BLOCK ||
          !integer(Number(l.logIndex ?? l.index))) fail('invalid historical auction origin');
      const args = Object.fromEntries(fragment.inputs.map((f, n) => [f.name, String(l.args[n] ?? l.args[f.name])]));
      if (!batch.includes(args.auctionId)) fail('unexpected historical auction ID');
      result.logs.push({ name: 'AuctionCreated', address: MARKET, blockNumber: Number(l.blockNumber),
        logIndex: Number(l.logIndex ?? l.index), transactionHash: l.transactionHash, args });
    }
  }
  return result;
}

export async function referralEntries(rows: Referral[], context: Context, options: FetchOptions) {
  if (!rows.length) return [] as Entry[];
  const provider = getProvider('base');
  if (!provider && rows.length) fail('RPC unavailable for source verification');
  const receipts = new Map<string, any>();
  // Sequential and once per tx (multiple commissions/parties may share a tx).
  for (const row of rows) {
    if (!receipts.has(row.tx_hash)) receipts.set(row.tx_hash, await provider!.getTransactionReceipt(row.tx_hash));
  }
  const withOrigins = await loadReferralAuctionOrigins(rows, receipts, context, options.getLogs);
  return rows.map(row => referralEntry(row, withOrigins, receipts.get(row.tx_hash)));
}
