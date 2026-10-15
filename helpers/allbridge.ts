// Shared constants for the Allbridge Classic on-chain rebuild (dexs + fees).
// Sources: https://docs.allbridge.io/allbridge-overview/bridge-contracts (addresses),
// verified bridge ABI on Etherscan (event layout).
import fetchURL, { postURL } from '../utils/fetchURL';
export const BRIDGE = '0xBBbD1BbB4f9b936C3604906D7592A644071dE884'; // same Classic bridge on all EVM legs below
export const SENT_ABI = 'event Sent(bytes4 tokenSource, bytes32 tokenSourceAddress, address sender, bytes32 indexed recipient, uint256 amount, uint128 indexed lockId, bytes4 destination)'; // recipient+lockId are indexed (topics)
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// tokenSourceAddress carries the source token in the FIRST 20 bytes
// (observed: USDC 0xa0b8..eb48 and APYS 0xf741..3615 both left-aligned,
// zero-filled after; e.g. tx 0x7a89f9...6642f9 and 0x8da28b...89aaab)
export const tokenFromSourceAddress = (sourceAddress: string): string | null => {
  const hex = sourceAddress.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  const first = '0x' + hex.slice(0, 40);
  const last = '0x' + hex.slice(-40);
  if (first !== ZERO_ADDRESS) return first;
  if (last !== ZERO_ADDRESS) return last;
  return null;
};

// ---- Stacks leg (Allbridge Classic) ----
// Bridge contract (current; legacy SP31MH65...bridge superseded):
// https://docs.allbridge.io/allbridge-overview/bridge-contracts
// Outbound transfers are `lock(lock-id, token, amount, recipient, destination)`
// contract-calls, enumerated via the public Hiro API (no key):
// https://api.mainnet.hiro.so/extended/v1/address/{bridge}/transactions
// Verified 2026-10-15: 5,041 total txs; sample lock u3400000000 token-aeusdc
// -> ETH on tx 0x3fcfad...fc22. Repr fields carry values, no clarity decoding.
// Volume reports the locked amount as-is: whether the fee comes out of it or
// on top is unverified on Stacks (EVM Sent.amount was observed net of fee).
// At 10bp the difference is dust either way.
export const STX_BRIDGE = 'SP3Y2ZSH8P7D50B0VBTSX11S7XSG24M1VB9YFQA4K.bridge';
const STX_API = 'https://api.mainnet.hiro.so';
// Bridged-token trait principals observed on the bridge -> pricing + decimals.
// aeUSDC is allowlisted to usd-coin: 1:1 redeemable through the bridge itself.
// Unknown traits THROW (repo rule: missing data throws, never silent zero).
const STX_TOKENS: Record<string, { id: string; decimals: number }> = {
  // Dedicated CoinGecko id tracks the wrapped token's own price (do NOT
  // assume $1: coingecko 'allbridge-bridged-usdc-stacks').
  'SP3Y2ZSH8P7D50B0VBTSX11S7XSG24M1VB9YFQA4K.token-aeusdc': { id: 'allbridge-bridged-usdc-stacks', decimals: 6 },
};

export interface StxLock {
  amount: bigint;
  token: string;
  decimals: number;
}

export async function getStacksLocks(startTimestamp: number, endTimestamp: number): Promise<StxLock[]> {
  const locks: StxLock[] = [];
  let offset = 0;
  for (;;) {
    const page = await fetchURL(`${STX_API}/extended/v1/address/${STX_BRIDGE}/transactions?limit=50&offset=${offset}`);
    const results = page.results ?? [];
    if (!results.length) break;
    let oldest = Infinity;
    for (const tx of results) {
      const bt = Math.floor(new Date(tx.block_time_iso).getTime() / 1000);
      oldest = Math.min(oldest, bt);
      if (bt < startTimestamp || bt >= endTimestamp) continue;
      const cc = tx.contract_call;
      if (tx.tx_type !== 'contract_call' || tx.tx_status !== 'success' || cc?.function_name !== 'lock') continue;
      const args: Record<string, string> = {};
      for (const a of cc.function_args ?? []) args[a.name] = a.repr;
      const trait = (args['trait-address'] ?? '').replace(/^'/, '');
      const known = STX_TOKENS[trait];
      if (!known) throw new Error(`allbridge stacks: unknown bridged token ${trait}`);
      const m = /^u(\d+)$/.exec(args['amount'] ?? '');
      if (!m) throw new Error(`allbridge stacks: unparseable amount ${args['amount']}`);
      locks.push({ amount: BigInt(m[1]), token: known.id, decimals: known.decimals });
    }
    if (oldest < startTimestamp) break;
    offset += results.length;
    if (offset > 50000) throw new Error('allbridge stacks: pagination runaway guard');
  }
  return locks;
}

export async function getStacksFeeBp(): Promise<bigint> {
  // Governance-set rate, read live: returns clarity (response-ok uint) hex.
  // Observed 2026-10-15: 0x0701000...000a = 10bp (0.1%), NOT the EVM 0.3%.
  const res: any = await postURL(
    `${STX_API}/v2/contracts/call-read/${STX_BRIDGE.replace(/\./, '/')}/get-base-fee-rate-bp`,
    { sender: STX_BRIDGE.split('.')[0], arguments: [] }
  );
  const hex = String(res.result ?? '').replace(/^0x/, '');
  const m = /^0701([0-9a-f]{32})$/.exec(hex);
  if (!m) throw new Error(`allbridge stacks: unexpected fee-rate encoding ${res.result}`);
  return BigInt('0x' + m[1]);
}

// ---- Solana leg (Allbridge Classic) ----
// Bridge account + program:
// https://docs.allbridge.io/allbridge-overview/bridge-contracts
// Outbound = `Lock` invocations of the bridge program. Attribution is strictly
// at instruction level (repo rule): only inner SPL transfers inside a Lock
// invocation count; unlock (receive side) invocations are excluded.
// Observed 2026-10 (tx 2GqduF...rvBN): Lock emits `Calculate fee` log plus two
// inner transfers, 48,599,967,785,585 + 146,238,633,882 (ratio 0.3009%) — the
// larger is the bridged amount, the smaller the actual fee. Fees here are
// OBSERVED transfers, not the nominal rate (better than the EVM estimate).
// Unlock (receive-side) invocations are excluded: volume counts source-chain
// outflow only (one side, repo rule). Verified 2026-08-16: 5 program txs in
// window = 4 Unlock + 1 Lock ($12.10 ABR); the recorded $1,125 SOL is almost
// entirely receive-side, i.e. the legacy API counted both sides of transfers.
// APYS mint identified via Jupiter token API; USDC/USDT are canonical.
export const SOL_BRIDGE_ACCOUNT = 'bb1XfNoER5QC3rhVDaVz3AJp9oFKoHNHG6PHfZLcCjj';
export const SOL_BRIDGE_PROGRAM = 'BBbD1WSjbHKfyE3TSFWF6vx1JV51c8msKSQy4ess6pXp';
// NOTE: enumeration runs on the PROGRAM id (all invocations). The bridge
// account above sees almost no traffic (5 sigs total, verified 2026-10-15)
// and must NOT be used for discovery.
// NOTE: enumeration runs on the PROGRAM id (all invocations). The bridge
// account above sees almost no traffic (5 sigs total, verified 2026-10-15)
// and must NOT be used for discovery.
const SOL_RPCS = ['https://api.mainnet-beta.solana.com', 'https://solana-rpc.publicnode.com'];
// Order matters: mainnet-beta serves deep signature history (verified 1000
// sigs back to 2026-01-29); publicnode truncates program history (5 sigs,
// verified 2026-10-15) but is steadier under load. solRpc falls through on
// any failure, so 429s on the first fall back to the second.
const SOL_SPL = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const SOL_MINTS: Record<string, { id: string; decimals: number }> = {
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { id: 'usd-coin', decimals: 6 },
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': { id: 'tether', decimals: 6 },
  '5JnZ667P3VcjDinkJFysWh2K2KtViy63FZ3oL5YghEhW': { id: 'apyswap', decimals: 9 },
  // Legacy ABR (Allbridge Classic token). ABR->ABR0 migrates 1:1 via the
  // trustless Ethereum contract (token.allbridge.io/migrate, no deadline),
  // so the ABR0 price is the parity price. https://allbridge.io/blog/core/abr0/
  'a11bdAAuV8iB2fu7X6AxAvDTo1QZ8FXB3kk5eecdasp': { id: 'allbridge', decimals: 9 },
};

export interface SolLock {
  amount: bigint;
  token: string;
  decimals: number;
  feeAmount: bigint;
  feeToken: string;
  feeDecimals: number;
}

async function solRpc(method: string, params: any[]): Promise<any> {
  const body = { jsonrpc: '2.0', id: 1, method, params };
  let lastErr: any = null;
  for (const rpc of SOL_RPCS) {
    try {
      const res: any = await postURL(rpc, body);
      if (res.error) throw new Error(`solana ${method}: ${JSON.stringify(res.error).slice(0, 200)}`);
      return res.result;
    } catch (e) { lastErr = e; }
  }
  throw new Error(`allbridge solana: all RPCs failed (${method}): ${lastErr?.message ?? lastErr}`);
}

export async function getSolanaLocks(startTimestamp: number, endTimestamp: number): Promise<SolLock[]> {
  const locks: SolLock[] = [];
  let before: string | undefined = undefined;
  for (;;) {
    const params: any = { limit: 1000 };
    if (before) params.before = before;
    const sigs: any[] = await solRpc('getSignaturesForAddress', [SOL_BRIDGE_PROGRAM, params]);
    if (!sigs.length) break;
    let oldest = Infinity;
    for (const s of sigs) {
      if (s.blockTime) oldest = Math.min(oldest, s.blockTime);
      if (s.err || !s.blockTime || s.blockTime < startTimestamp || s.blockTime >= endTimestamp) continue;
      const tx: any = await solRpc('getTransaction', [s.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]);
      // Missing tx data must THROW, never skip silently (repo rule): the refill
      // job caches whatever returns, and a gap would store as a false zero.
      if (!tx) throw new Error(`allbridge solana: transaction unavailable ${s.signature}`);
      const topIxs: any[] = tx.transaction.message.instructions;
      const bridgeTopIdx: number[] = [];
      topIxs.forEach((ix: any, i: number) => {
        if ((ix.programId ?? ix.program) === SOL_BRIDGE_PROGRAM) bridgeTopIdx.push(i);
      });
      // walk program logs: k-th top-level bridge invocation <-> k-th frame
      const frames: boolean[] = [];
      let depth = 0;
      let capturing = false;
      for (const line of tx.meta?.logMessages ?? []) {
        let m = new RegExp(`^Program ${SOL_BRIDGE_PROGRAM} invoke \\[(\\d+)\\]`).exec(line);
        if (m) { depth++; if (m[1] === '1') { frames.push(false); capturing = true; } continue; }
        if (capturing && depth >= 1 && line === 'Program log: Instruction: Lock') frames[frames.length - 1] = true;
        m = new RegExp(`^Program ${SOL_BRIDGE_PROGRAM} (success|failed)`).exec(line);
        if (m) { depth = Math.max(0, depth - 1); if (depth === 0) capturing = false; }
      }
      const accountKeys: string[] = (tx.transaction.message.accountKeys ?? []).map((k: any) => typeof k === 'string' ? k : k.pubkey);
      const preBalances: any[] = tx.meta?.preTokenBalances ?? [];
      const mintByAccount = new Map<string, { mint: string }>();
      accountKeys.forEach((key: string, i: number) => {
        const b = preBalances.find((x: any) => x.accountIndex === i);
        if (b?.mint) mintByAccount.set(key, { mint: b.mint });
      });
      bridgeTopIdx.forEach((topIdx: number, k: number) => {
        if (!frames[k]) return; // not a Lock invocation (unlock etc.)
        const group = (tx.meta?.innerInstructions ?? []).find((g: any) => g.index === topIdx);
        const transfers: Array<{ amount: bigint; source: string }> = [];
        for (const ix of group?.instructions ?? []) {
          if (ix.program !== 'spl-token' || ix.parsed?.type !== 'transfer') continue;
          transfers.push({ amount: BigInt(ix.parsed.info.amount), source: ix.parsed.info.source });
        }
        if (!transfers.length) return;
        transfers.sort((a, b) => (a.amount < b.amount ? 1 : -1));
        const vol = transfers[0];
        const volMint = mintByAccount.get(vol.source)?.mint;
        const known = volMint ? SOL_MINTS[volMint] : undefined;
        if (!known) throw new Error(`allbridge solana: unknown mint ${volMint} in ${s.signature}`);
        let feeAmount = 0n;
        let feeToken = known.id;
        let feeDecimals = known.decimals;
        for (const t of transfers.slice(1)) {
          const fm = mintByAccount.get(t.source)?.mint;
          const fk = fm ? SOL_MINTS[fm] : undefined;
          if (!fk) throw new Error(`allbridge solana: unknown fee mint ${fm} in ${s.signature}`);
          if (fm !== volMint) throw new Error(`allbridge solana: mixed-mint lock ${s.signature}`);
          feeAmount += t.amount;
        }
        locks.push({ amount: vol.amount, token: known.id, decimals: known.decimals, feeAmount, feeToken, feeDecimals });
      });
    }
    before = sigs[sigs.length - 1].signature;
    if (oldest < startTimestamp) break;
    if (sigs.length < 1000) break;
  }
  return locks;
}

// ---- Near leg (Allbridge Classic) ----
// Bridge contract: bridge.a11bd.near (verified live via native RPC 2026-10-15).
// Outbound = `lock` calls. The amount and fee are NOT in the lock args —
// they arrive in the same tx's `callback_create_lock` action:
//   { fee: "101560667290070379675888329",
//     create_lock_args: { amount: "33853552378001216889616787353", ... } }
// (observed tx 3QYNoWSG...fxSqRxf7hU9V: $103.6 APYS lock, fee exactly 0.30%).
// Token id comes from the sibling `lock` action's lock_args.token_address.
// Withdraw (receive-side) receipts are excluded: source outflow only.
// Enumerated via the public NearBlocks API (no key), cursor-paginated:
// https://api.nearblocks.io/v1/account/bridge.a11bd.near/txns
export const NEAR_BRIDGE = 'bridge.a11bd.near';
const NEARBLOCKS_API = 'https://api.nearblocks.io/v1';
// NOTE: NearBlocks throttles sustained deep enumeration (429 kills multi-week
// walks from a single egress, verified 2026-10-15). Hourly runs touch 1-3
// recent pages and are unaffected; full-history backfills run server-side.
// token contracts observed on the bridge -> pricing + decimals (ft_metadata).
// APYS decimals 24 verified via native ft_metadata call 2026-10-15.
const NEAR_TOKENS: Record<string, { id: string; decimals: number }> = {
  'apys.token.a11bd.near': { id: 'apyswap', decimals: 24 },
};

export interface NearLock {
  amount: bigint;
  token: string;
  decimals: number;
  feeAmount: bigint;
}

// Page cache (per process): a full-day test runs 24 hourly slots that all
// re-walk the same recent pages; without this, NearBlocks throttles the run
// (429s observed 2026-10-15). Pages are append-only snapshots so sharing them
// inside one process is safe; production hourly runs are separate processes.
const nearPageCache = new Map<string, any>();

export async function getNearLocks(startTimestamp: number, endTimestamp: number): Promise<NearLock[]> {
  const locks: NearLock[] = [];
  let cursor: string | undefined = undefined;
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
  const getPage = async (url: string): Promise<any> => {
    const hit = nearPageCache.get(url);
    if (hit) return hit;
    // Pace live fetches (see cache comment above); cache hits skip the wait.
    await sleep(2000);
    let lastErr: any = null;
    for (const wait of [0, 2000, 5000, 10000]) {
      if (wait) await sleep(wait);
      try {
        const page = await fetchURL(url);
        nearPageCache.set(url, page);
        return page;
      } catch (e) { lastErr = e; }
    }
    throw new Error(`allbridge near: page failed after retries: ${lastErr?.message ?? lastErr}`);
  };
  for (;;) {
    const url = `${NEARBLOCKS_API}/account/${NEAR_BRIDGE}/txns?limit=50` + (cursor ? `&cursor=${cursor}` : '');
    const page: any = await getPage(url);
    await sleep(2000); // NearBlocks throttles enumeration bursts (429s observed
    // 2026-10-15 even at 750ms); hourly adapter runs touch 1-3 recent pages
    const txns: any[] = page.txns ?? [];
    if (!txns.length) break;
    cursor = page.cursor;
    let oldest = Infinity;
    // group actions by tx: lock args (token) + callback_create_lock (amount/fee)
    const byTx = new Map<string, any[]>();
    for (const t of txns) {
      const bt = Math.floor(Number(t.block_timestamp) / 1e9);
      if (!bt) continue;
      oldest = Math.min(oldest, bt);
      if (bt < startTimestamp || bt >= endTimestamp) continue;
      if (!byTx.has(t.transaction_hash)) byTx.set(t.transaction_hash, []);
      byTx.get(t.transaction_hash)!.push(t);
    }
    for (const [, receipts] of byTx) {
      let tokenAddr: string | undefined;
      let amount: string | undefined;
      let fee: string | undefined;
      for (const r of receipts) {
        if (r.receiver_account_id !== NEAR_BRIDGE) continue;
        for (const a of r.actions ?? []) {
          if (a.action !== 'FUNCTION_CALL') continue;
          const args = typeof a.args === 'string' ? JSON.parse(a.args) : (a.args ?? {});
          if (a.method === 'lock') tokenAddr = args.lock_args?.token_address;
          if (a.method === 'callback_create_lock') {
            amount = args.create_lock_args?.amount;
            fee = args.fee;
          }
        }
      }
      if (!amount || !tokenAddr) continue;
      const known = NEAR_TOKENS[tokenAddr];
      if (!known) throw new Error(`allbridge near: unknown token ${tokenAddr}`);
      locks.push({ amount: BigInt(amount), token: known.id, decimals: known.decimals, feeAmount: BigInt(fee ?? '0') });
    }
    if (oldest < startTimestamp) break;
    if (!cursor) break;
  }
  return locks;
}

// ---- Tezos leg (Allbridge Classic) ----
// Bridge: KT1K8ay1iJBjGuksebrJ6XHD5knMA6rqsJL8 ("Allbridge Bridge Legacy",
// creator Allbridge project). Outbound = `lock_asset` calls, enumerated via
// the public TzKT API with server-side time filters (no pagination walk):
// https://api.tzkt.io/v1/operations/transactions?target=...&entrypoint=lock_asset
// Verified 2026-10-15: NO lock_asset call since 2022-08-24 — Tezos outflow is
// dead (unlock/receive activity continued as of 2w ago). Any future lock
// THROWS (token pricing unmapped) rather than mispricing: a live leg that
// correctly reports zero while outflow is dead.
export const TEZ_BRIDGE = 'KT1K8ay1iJBjGuksebrJ6XHD5knMA6rqsJL8';

export interface TezLock {
  amount: bigint;
  token: string;
  decimals: number;
}

export async function getTezosLocks(startTimestamp: number, endTimestamp: number): Promise<TezLock[]> {
  const from = new Date(startTimestamp * 1000).toISOString();
  const to = new Date(endTimestamp * 1000).toISOString();
  // Any hit throws, so no pagination is needed: the first lock ends the run.
  // Half-open window (repo rule): TzKT `le` is inclusive, so use `lt` for the
  // end — a lock exactly at midnight belongs to the next day.
  const ops: any[] = await fetchURL(
    `https://api.tzkt.io/v1/operations/transactions?target=${TEZ_BRIDGE}&entrypoint=lock_asset&status=applied&timestamp.ge=${from}&timestamp.lt=${to}&limit=5&select=hash`
  );
  if (ops.length) throw new Error(`allbridge tezos: unexpected lock traffic, token mapping needed: ${ops[0].hash}`);
  return [];
}

// ---- Stellar leg (Allbridge Classic) ----
// Bridge account: GALLBRBQHAPW5FOVXXHYWR6J4ZDAQ35BMSNADYGBW25VOUHUYRZM4XIL
// (docs.allbridge.io bridge-contracts). Outbound from Stellar = payments TO
// the bridge account, enumerated via public Horizon (no key), cursor-paged:
// https://horizon.stellar.org/accounts/{id}/payments?order=desc
// Verified 2026-10-15: live traffic (1.014 asSOL deposit same day) plus
// 1-stroop native-XLM residue (account-creation dust, not volume).
// Rules: bridge-issued tokens (asSOL) TO the bridge are always bridge flow
// (redeeming IOUs has no other purpose). Native XLM counts ONLY with a
// routing memo on the parent transaction (Classic routes via memo); the
// stroop dust carries none. asSOL is allowlisted to solana: 1:1 redeemable
// through the bridge itself. Unknown assets THROW.
export const XLM_BRIDGE = 'GALLBRBQHAPW5FOVXXHYWR6J4ZDAQ35BMSNADYGBW25VOUHUYRZM4XIL';
const XLM_HORIZON = 'https://horizon.stellar.org';
const XLM_ASSETS: Record<string, { id: string; decimals: number }> = {
  [`asSOL:${XLM_BRIDGE}`]: { id: 'solana', decimals: 7 },
  'XLM:native': { id: 'stellar', decimals: 7 },
};

export interface XlmLock {
  amount: bigint;
  token: string;
  decimals: number;
}

function xlmUnits(s: string): bigint {
  // Horizon amounts are 7dp decimal strings ("1.0140000").
  const [i, f = ''] = s.split('.');
  return BigInt(i) * 10_000_000n + BigInt((f + '0000000').slice(0, 7));
}

export async function getStellarLocks(startTimestamp: number, endTimestamp: number): Promise<XlmLock[]> {
  const locks: XlmLock[] = [];
  let cursor: string | undefined = undefined;
  for (;;) {
    const url = `${XLM_HORIZON}/accounts/${XLM_BRIDGE}/payments?order=desc&limit=200` + (cursor ? `&cursor=${cursor}` : '');
    const page: any = await fetchURL(url);
    const records: any[] = page._embedded?.records ?? [];
    if (!records.length) break;
    let oldest = Infinity;
    for (const r of records) {
      const bt = Math.floor(new Date(r.created_at).getTime() / 1000);
      oldest = Math.min(oldest, bt);
      if (bt < startTimestamp || bt >= endTimestamp) continue;
      if (r.type !== 'payment' || r.to !== XLM_BRIDGE) continue;
      const key = r.asset_type === 'native' ? 'XLM:native' : `${r.asset_code}:${r.asset_issuer}`;
      const known = XLM_ASSETS[key];
      if (!known) throw new Error(`allbridge stellar: unknown asset ${key}`);
      if (r.asset_type === 'native') {
        // routing proof required: Classic Stellar deposits carry a memo.
        const tx: any = await fetchURL(`${XLM_HORIZON}/transactions/${r.transaction_hash}`);
        if (!tx.memo || tx.memo_type === 'none') continue;
      }
      locks.push({ amount: xlmUnits(r.amount), token: known.id, decimals: known.decimals });
    }
    const next: string | undefined = page._links?.next?.href?.match(/cursor=(\d+)/)?.[1];
    if (oldest < startTimestamp || !next || next === cursor) break;
    cursor = next;
  }
  return locks;
}

// ---- Waves leg (Allbridge Classic) ----
// Bridge dApp: 3PQDRn2XPVtctY2pk83W3qVykWqXPvoU5Zp — found via the asset
// issuer trail (abUSDC E4JNMDDQ... "by Allbridge" -> issuer -> scripted dApp
// with BRIDGE_MANAGER_m/ASSET_MANAGER_m data entries, verified 2026-10-15).
// The address appears in NO surviving public doc, API, or repo; this trail
// is the only public proof. Outbound = `lock` invokes carrying the locked
// funds as attached `payment: [{amount, assetId}]`.
// (observed 2024-09-17: 4,087,960,930,883 units of L2MP 7scqyYoVs...).
// Enumerated via the public nodes API (no key); one limit=1000 call covers
// the whole lifetime (2022-10-03 -> present, sparse traffic). Unknown asset
// ids THROW (priced per-observation, never assumed).
const WAVES_BRIDGE = '3PQDRn2XPVtctY2pk83W3qVykWqXPvoU5Zp';
const WAVES_API = 'https://nodes.wavesnodes.com';
// Waves-issued Allbridge tokens (decimals verified via assets/details
// 2026-10-15). Mapped to usd-coin: 1:1 redeemable through the bridge itself
// (same allowlist rationale as aeUSDC-on-Stacks). Unknown assets THROW.
const WAVES_ASSETS: Record<string, { id: string; decimals: number }> = {
  'E4JNMDDQbNip6U7ccguNNxhMcd65aiGstLA4jDk8fXDp': { id: 'usd-coin', decimals: 6 }, // abUSDC
  '4ME7zAhZUrRZfnW7NH1oYWFmXGqGZxNAYQY8FmeMohyp': { id: 'usd-coin', decimals: 6 }, // aeUSDC
};

export interface WavesLock {
  amount: bigint;
  token: string;
  decimals: number;
}

export async function getWavesFeeBp(): Promise<bigint> {
  // Governance-set base rate, read live from dApp state (verified 10bp =
  // 0.1% on 2026-10-15, matching the documented Stacks/XRPL tier).
  const entry: any = await fetchURL(`${WAVES_API}/addresses/data/${WAVES_BRIDGE}/_bfr`);
  if (typeof entry?.value !== 'number') throw new Error('allbridge waves: unexpected _bfr encoding');
  return BigInt(entry.value);
}

export async function getWavesLocks(startTimestamp: number, endTimestamp: number): Promise<WavesLock[]> {
  const locks: WavesLock[] = [];
  const pages: any[] = await fetchURL(`${WAVES_API}/transactions/address/${WAVES_BRIDGE}/limit/1000`);
  const rows = pages.flat();
  if (rows.length >= 1000) {
    const oldest = Math.min(...rows.map((t: any) => t.timestamp));
    if (oldest / 1000 > startTimestamp) throw new Error('allbridge waves: lifetime exceeds single batch, paging needed');
  }
  for (const t of rows) {
    if (t.type !== 16 || (t.call?.function) !== 'lock') continue;
    const bt = Math.floor(t.timestamp / 1000);
    if (bt < startTimestamp || bt >= endTimestamp) continue;
    for (const p of t.payment ?? []) {
      const known = WAVES_ASSETS[p.assetId];
      if (!known) throw new Error(`allbridge waves: unknown asset ${p.assetId}`);
      locks.push({ amount: BigInt(p.amount), token: known.id, decimals: known.decimals });
    }
  }
  return locks;
}
