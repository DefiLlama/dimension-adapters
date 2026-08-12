/**
 * Stratabook (Strata DEX) — Solana CLOB + vault + Sonar aggregator.
 *
 * PR target: https://github.com/DefiLlama/dimension-adapters
 * Final path: `dexs/stratabook/index.ts`
 *
 * ── Protocol ───────────────────────────────────────────────────────
 *
 * Stratabook is a fully on-chain CLOB on Solana with three execution
 * layers, all settled by the same CLOB program
 * (`strataZWURmW6bzMWpkLCAFxNFrQXCNSE9cSmBmdPgP`):
 *
 *   L1 — native limit-order book fills        (source = 0)
 *   L2 — RFQ / MM-signed quote settlement     (source = 1)
 *   L3 — Sonar aggregator / AVL routed swaps  (source = 2, 4)
 *
 * Every match emits an `OrderFilled` event via `sol_log_data`:
 *
 *   Program data: <base64>   (100 bytes)
 *     [0]        tag          = 3 (EventTag::OrderFilled)
 *     [1..33]    maker_pda
 *     [33..65]   taker_pda
 *     [65..73]   maker_order_id   (u64 LE)
 *     [73..81]   taker_order_id   (u64 LE)
 *     [81..89]   fill_size        (u64 LE, base-token atoms)
 *     [89..97]   settle_price     (u64 LE, quote atoms per base atom)
 *     [97]       source           (0=L1, 1=L2, 2=L3-AVL, 3=MEV, 4=L3-AVL-wrapped)
 *     [98..99]   maker_filled / taker_filled flags
 *
 * Volume = Σ fill_size (base side, USD-priced by DefiLlama).
 * The market PDA for a fill is recovered from the tx's account list
 * (settle txs pass exactly one Market account; layout verified
 * against live mainnet accounts).
 *
 * ── Fees / Revenue methodology ─────────────────────────────────────
 *
 *   taker fee  = fill_size × Market.taker_fee_bps   (all sources)
 *   maker rebate = 0 (ships 0, never wired — no rebate paid today)
 *
 *   dailyFees    = taker fee (what users pay)
 *   dailyRevenue = dailyFees (taker fee kept in full; maker rebate 0)
 *   dailySupplySideRevenue = 0 (no LP incentives paid)
 *
 * Market account layout (program-rust/src/state/market.rs, byte offsets
 * verified against live mainnet accounts):
 *   [8..40]  base_mint, [40..72] quote_mint, [72..104] base_vault,
 *   [104..136] quote_vault, [160..162] taker_fee_bps (u16 LE),
 *   [162..164] maker_rebate_bps (u16 LE, 0), [164..166] swap_fee_bps (u16 LE),
 *   [300] base_decimals, [301] quote_decimals
 */

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import axios from "axios";
import { getEnv } from "../../helpers/env";

const CLOB_PROGRAM = "strataZWURmW6bzMWpkLCAFxNFrQXCNSE9cSmBmdPgP";
const MARKET_DATA_SIZES = [384, 416]; // Market V2, V3 account sizes

// Market account field offsets (see header)
const MKT_BASE_MINT = 8;
const MKT_QUOTE_MINT = 40;
const MKT_TAKER_FEE_BPS = 160;
const MKT_SWAP_FEE_BPS = 164;

const EVENT_ORDER_FILLED = 3;
const FILL_SIZE_OFF = 81;
const SETTLE_PRICE_OFF = 89;
const SOURCE_OFF = 97;

const BATCH = 40; // txs per batch RPC call
const MAX_SIGS_PER_RUN = 2000; // safety cap
const FALLBACK_RPCS = [
  "https://api.mainnet-beta.solana.com",
  "https://solana-rpc.publicnode.com",
];

// ── tiny base58 (no external dep) ──────────────────────────────────
const B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58Encode(bytes: Uint8Array): string {
  let x = BigInt("0x" + Buffer.from(bytes).toString("hex"));
  let out = "";
  while (x > 0n) {
    out = B58_ALPHABET[Number(x % 58n)] + out;
    x /= 58n;
  }
  for (const b of bytes) if (b === 0) out = "1" + out; else break;
  return out;
}

async function rpc(url: string, method: string, params: unknown[]): Promise<any> {
  const { data } = await axios.post(url, { jsonrpc: "2.0", id: 1, method, params }, { timeout: 60000 });
  if (data.error) throw new Error(`RPC ${method}: ${JSON.stringify(data.error)}`);
  return data.result;
}

async function rpcBatch(url: string, requests: { method: string; params: unknown[] }[]): Promise<any[]> {
  const body = requests.map((r, i) => ({ jsonrpc: "2.0", id: i, method: r.method, params: r.params }));
  const { data } = await axios.post(url, body, { timeout: 90000 });
  const byId = new Map<number, any>(data.map((d: any) => [d.id, d]));
  return requests.map((_, i) => {
    const item = byId.get(i);
    if (item?.error) throw new Error(`RPC batch item error: ${JSON.stringify(item.error)}`);
    return item?.result;
  });
}

interface MarketInfo {
  baseMint: string;
  quoteMint: string;
  takerFeeBps: number;
  swapFeeBps: number;
}

async function getMarkets(): Promise<Map<string, MarketInfo>> {
  const markets = new Map<string, MarketInfo>();
  for (const size of MARKET_DATA_SIZES) {
    const accounts = await withRetry((url) => rpc(url, "getProgramAccounts", [CLOB_PROGRAM, { encoding: "base64", filters: [{ dataSize: size }] }]));
    for (const acc of accounts ?? []) {
      const buf = Buffer.from(acc.account.data[0], "base64");
      if (buf.length < 384) continue;
      markets.set(acc.pubkey, {
        baseMint: base58Encode(buf.subarray(MKT_BASE_MINT, MKT_BASE_MINT + 32)),
        quoteMint: base58Encode(buf.subarray(MKT_QUOTE_MINT, MKT_QUOTE_MINT + 32)),
        takerFeeBps: buf.readUInt16LE(MKT_TAKER_FEE_BPS),
        swapFeeBps: buf.readUInt16LE(MKT_SWAP_FEE_BPS),
      });
    }
  }
  return markets;
}

interface Fill {
  fillSize: bigint;
  source: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withRetry<T>(fn: (url: string) => Promise<T>, tries = 4): Promise<T> {
  const primary = getEnv("SOLANA_RPC");
  const urls = [primary, ...FALLBACK_RPCS.filter((u) => u !== primary)];
  let lastErr: any;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn(urls[i % urls.length]);
    } catch (e: any) {
      lastErr = e;
      const status = e?.response?.status;
      const retryable = status === 429 || status >= 500 || !status || e?.code === "ECONNABORTED";
      if (i === tries - 1 || !retryable) throw e;
      await sleep(600 * (i + 1));
    }
  }
  throw lastErr;
}

// Fetch tx JSON for a list of signatures. Tries one batch against the
// configured RPC (DefiLlama infra supports batches); if that fails,
// falls back to sequential single-tx fetches with endpoint rotation
// (public RPCs commonly cap getTransaction batches at 1).
async function fetchTxs(signatures: string[]): Promise<any[]> {
  try {
    return await rpcBatch(getEnv("SOLANA_RPC"), signatures.map((signature) => ({
      method: "getTransaction",
      params: [signature, { maxSupportedTransactionVersion: 0, encoding: "json" }],
    })));
  } catch {
    // sequential fallback
    const out: any[] = [];
    for (const signature of signatures) {
      // RPC returning null = tx expired from node storage (legit skip).
      // Persistent RPC errors must propagate — silently dropping txs
      // would understate volume.
      out.push(await withRetry((url) => rpc(url, "getTransaction", [
        signature, { maxSupportedTransactionVersion: 0, encoding: "json" },
      ])));
      await sleep(120);
    }
    return out;
  }
}

const fetch = async (options: FetchOptions) => {
  const { createBalances } = options;
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  const markets = await getMarkets();
  if (markets.size === 0) throw new Error("Stratabook: no market accounts found — cannot compute volume (data source unavailable)");

  const start = options.startTimestamp;
  const end = options.endTimestamp;

  let before: string | undefined;
  let processed = 0;
  let done = false;
  let historyExhausted = false;

  while (!done && processed < MAX_SIGS_PER_RUN) {
    const sigs = (await withRetry((url) => rpc(url, "getSignaturesForAddress", [
      CLOB_PROGRAM,
      { limit: 100, ...(before ? { before } : {}) },
    ]))) ?? [];
    if (sigs.length === 0) { historyExhausted = true; break; }

    // collect the chunk of sigs that are still within the window
    const inWindow: { signature: string }[] = [];
    for (const s of sigs) {
      if (s.blockTime != null && s.blockTime < start) { done = true; break; }
      inWindow.push(s);
    }
    if (inWindow.length === 0) break;

    // fetch txs in batches (self-adapting to RPC batch limits)
    const signatures = inWindow.map((s) => s.signature);
    const txs = await fetchTxs(signatures);
    for (const tx of txs) {
        if (!tx?.meta || tx.meta.err || tx.blockTime == null) continue;
        if (tx.blockTime < start) { done = true; continue; }
        if (tx.blockTime >= end) continue;

        const accountKeys: string[] = [];
        if (tx.transaction?.message?.accountKeys) {
          for (const k of tx.transaction.message.accountKeys) {
            accountKeys.push(typeof k === "string" ? k : k.pubkey);
          }
        }
        // v0 txs: CPI-loaded addresses live in meta.loadedAddresses
        const loaded = tx.meta?.loadedAddresses;
        if (loaded) {
          accountKeys.push(...(loaded.writable ?? []), ...(loaded.readonly ?? []));
        }
        // market(s) touched by this tx
        const txMarkets = [...accountKeys].map((k) => markets.get(k)).filter((m): m is MarketInfo => !!m);
        if (txMarkets.length === 0) continue;
        const market = txMarkets[0]; // settle txs carry exactly one Market account

        // Only decode "Program data:" payloads emitted while the CLOB
        // program itself is the active invocation — a non-Stratabook
        // program's event in the same tx must not be counted.
        let inClobInvoke = false;
        for (const log of tx.meta.logMessages ?? []) {
          if (log.startsWith(`Program ${CLOB_PROGRAM} invoke`)) { inClobInvoke = true; continue; }
          if (log.startsWith(`Program ${CLOB_PROGRAM} success`) || log.startsWith(`Program ${CLOB_PROGRAM} failed`)) { inClobInvoke = false; continue; }
          if (!inClobInvoke) continue;
          if (!log.startsWith("Program data: ")) continue;
          const buf = Buffer.from(log.slice("Program data: ".length), "base64");
          if (buf.length < 100 || buf[0] !== EVENT_ORDER_FILLED) continue;

          const fillSize = buf.readBigUInt64LE(FILL_SIZE_OFF);
          if (fillSize === 0n) continue;
          const source = buf[SOURCE_OFF];

          dailyVolume.add(market.baseMint, fillSize.toString());

          // fees: taker fee on every fill (maker rebate ships 0)
          const takerFee = (fillSize * BigInt(market.takerFeeBps)) / 10000n;
          dailyFees.add(market.baseMint, takerFee.toString());
          dailyRevenue.add(market.baseMint, takerFee.toString());
        }
      }
      processed += signatures.length;
      await sleep(150); // be gentle with public RPCs

      if (sigs.length < 100) { historyExhausted = true; break; }
      before = sigs[sigs.length - 1].signature;
    }

  // Never publish balances from a partial scan: if we hit the signature
  // cap before exhausting the historical window, the result would
  // understate volume. No data is better than wrong data.
  if (!done && !historyExhausted && processed >= MAX_SIGS_PER_RUN) {
    throw new Error(`Stratabook: signature cap (${MAX_SIGS_PER_RUN}) hit before reaching window start — refusing partial data`);
  }

  return { dailyVolume, dailyFees, dailyRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.SOLANA],
  start: "2026-08-09", // first on-chain activity on the CLOB program
  fetch,
  methodology: {
    Volume:
      "Trading volume from on-chain OrderFilled events on the Stratabook CLOB program, " +
      "covering L1 orderbook, L2 RFQ, and L3 Sonar/AVL routed fills. Sum of base-side fill sizes, USD-priced by DefiLlama.",
    Fees:
      "Taker fee (Market.taker_fee_bps) on all fills. Maker rebate ships 0 and is not paid.",
    Revenue:
      "Taker fee kept in full (maker rebate ships 0 and is not paid).",
    SupplySideRevenue: "0 — no LP incentives paid.",
  },
  breakdownMethodology: {
    Fees: {
      "swap fees": "taker_fee_bps on all fills",
    },
    Revenue: {
      "swap fees": "taker_fee_bps on all fills",
    },
  },
};

export default adapter;
