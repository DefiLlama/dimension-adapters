import { PromisePool } from "@supercharge/promise-pool";
import type { FetchOptions } from "../adapters/types";
import { postURL } from "../utils/fetchURL";
import { getCache, setCache } from "./cache";

// Shared readers for the GrowStreams StonkBase desk on Vara Mainnet (spot CLOB + RWA perps).
// Used by dexs/vara-grow-streams-spot, dexs/vara-grow-streams-perps and open-interest/vara-grow-streams-perps.

const VARA_RPC = "https://rpc.vara.network";

// Vara Mainnet program IDs from `deploy-state.json` in https://github.com/Satyam-10124/growstreams-v3
// GrowStreams Spot CLOB Orderbook (`GROWSTREAMS_ORDERBOOK`): On-chain Central Limit Order Book DEX (`PlaceSpotOrder`, `FillSpotOrder`, `GetSpotTrade`)
export const GROWSTREAMS_ORDERBOOK = "0x2c1dd07810480a34b7369fbf0ff0c97651c6db1f26ffc5eaff6490d6b20263cf";
// GrowStreams 5x RWA Perps Desk (`GROWSTREAMS_PERPS_DESK`): On-chain 1x–5x Leveraged RWA Perpetuals & Stock Desk (`OpenStockPosition`, `CloseStockPosition`, `GetPosition`)
export const GROWSTREAMS_PERPS_DESK = "0x8073da7aa8e51624ef4c1d41a8e22065cfe8b9ff9e6d5b7f969158397465da81";

const ZERO_ACCOUNT = "0x" + "0".repeat(64);
// 750B gas units: Vara Mainnet read-only block gas allowance for `gear_calculateReplyForHandle` state queries (from `api/deploy-stonkbase-vara-dex-and-perps.mjs`).
const GAS_LIMIT = 750_000_000_000;
const VARA_DECIMALS = 1e12;

// Retry & concurrency throttling parameters selected to keep burst rate below public `https://rpc.vara.network` HTTP 429 limits.
const MAX_RPC_ATTEMPTS = 6;
const BASE_BACKOFF_MS = 400;
const BACKOFF_JITTER_MS = 200;
const POOL_CONCURRENCY = 8;
const POOL_THROTTLE_BASE_MS = 20;
const POOL_THROTTLE_JITTER_MS = 40;

// Basis-point denominator (10,000 bps = 100%) matching `pub const BPS: u128 = 10_000` in `agents/contracts/stonkbase-vara-desk/src/lib.rs` (line 11).
export const BPS_DENOMINATOR = 10_000n;
// Spot CLOB fee constants matching `pub const SPOT_FEE_BPS: u128 = 30` in `agents/contracts/stonkbase-vara-desk/src/lib.rs` (line 12):
// 30 bps (0.30%) total fee split into 25 bps (0.25%) maker/LP rebate and 5 bps (0.05%) protocol treasury fee.
export const SPOT_MAKER_REBATE_BPS = 25n;
export const SPOT_PROTOCOL_FEE_BPS = 5n;
export const SPOT_FEE_BPS = SPOT_MAKER_REBATE_BPS + SPOT_PROTOCOL_FEE_BPS;
// Perpetuals open/close execution fee matching `pub const PERPS_FEE_BPS: u128 = 10` (10 bps = 0.10% on notional) in `agents/contracts/stonkbase-vara-desk/src/lib.rs` (line 13).
export const PERPS_FEE_BPS = 10n;
// Post-deployment live cutoff IDs (`Trades #1..#12` and `Positions #1..#7` were initial contract deployment verification records closed on-chain).
const FIRST_LIVE_SPOT_TRADE_ID = 13;
const FIRST_LIVE_POSITION_ID = 8;

/**
 * Converts a VARA amount in plancks (12 decimals) into whole VARA.
 */
export function plancksToVara(plancks: bigint): number {
  return Number(plancks) / VARA_DECIMALS;
}

/**
 * Encodes a short UTF-8 string (< 64 bytes) with its single-byte SCALE compact length prefix.
 */
function scaleString(value: string): Buffer {
  const bytes = Buffer.from(value, "utf8");
  return Buffer.concat([Buffer.from([bytes.length << 2]), bytes]);
}

/**
 * Builds a Sails service/method routing prefix buffer for `gear_calculateReplyForHandle`.
 */
function route(service: string, method: string): Buffer {
  return Buffer.concat([scaleString(service), scaleString(method)]);
}

const ROUTE_SPOT_TRADES_COUNT = route("StonkBaseService", "GetSpotTradesCount");
const ROUTE_GET_SPOT_TRADE = route("StonkBaseService", "GetSpotTrade");
const ROUTE_POSITIONS_COUNT = route("StonkBaseService", "GetPositionsCount");
const ROUTE_GET_POSITION = route("StonkBaseService", "GetPosition");

/**
 * Reads an unsigned 64-bit little-endian integer from `buf` at `offset` as a JS number.
 */
function u64LE(buf: Buffer, offset = 0): number {
  return Number(buf.readBigUInt64LE(offset));
}

/**
 * Reads an unsigned 128-bit little-endian integer from `buf` at `offset` as a bigint.
 */
function u128LE(buf: Buffer, offset = 0): bigint {
  return buf.readBigUInt64LE(offset) + (buf.readBigUInt64LE(offset + 8) << 64n);
}

/**
 * Decodes a SCALE compact-encoded unsigned 32-bit integer starting at `offset` in `buf`.
 */
function decodeScaleCompactU32(buf: Buffer, offset: number): { value: number; nextOffset: number } {
  if (offset >= buf.length) throw new Error("unexpected EOF reading SCALE compact integer");
  const mode = buf[offset] & 3;
  if (mode === 0) return { value: buf[offset] >> 2, nextOffset: offset + 1 };
  if (mode === 1) return { value: buf.readUInt16LE(offset) >> 2, nextOffset: offset + 2 };
  if (mode === 2) return { value: buf.readUInt32LE(offset) >>> 2, nextOffset: offset + 4 };
  throw new Error(`unsupported SCALE compact mode ${mode}`);
}

/**
 * Decodes a SCALE compact-encoded UTF-8 string starting at `offset` in `buf`.
 */
function decodeScaleString(buf: Buffer, offset: number): { value: string; nextOffset: number } {
  const { value: byteLen, nextOffset: start } = decodeScaleCompactU32(buf, offset);
  const end = start + byteLen;
  if (end > buf.length) throw new Error("unexpected EOF reading SCALE string");
  return { value: buf.subarray(start, end).toString("utf8"), nextOffset: end };
}

/**
 * Executes a read-only `gear_calculateReplyForHandle` JSON-RPC query against Vara Mainnet with exponential backoff.
 * Passes `0` retries to `postURL` so this loop is the sole retry mechanism.
 */
async function rpcCall(program: string, payloadHex: string): Promise<Buffer> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_RPC_ATTEMPTS; attempt++) {
    try {
      const res: any = await postURL(
        VARA_RPC,
        {
          jsonrpc: "2.0",
          id: 1,
          method: "gear_calculateReplyForHandle",
          params: [ZERO_ACCOUNT, program, payloadHex, GAS_LIMIT, 0],
        },
        0
      );
      if (res.error) throw new Error(JSON.stringify(res.error));
      const result = res.result;
      if (!result?.payload || result.payload === "0x" || !result.code?.Success) {
        throw new Error(`failed reply: ${JSON.stringify(result?.code)}`);
      }
      return Buffer.from(result.payload.slice(2), "hex");
    } catch (e) {
      lastErr = e;
      const msg = String((e as any)?.message ?? e);
      if (
        attempt < MAX_RPC_ATTEMPTS - 1 &&
        (msg.includes("429") || msg.includes("Too Many Requests") || attempt < 2)
      ) {
        await new Promise((r) => setTimeout(r, BASE_BACKOFF_MS * 2 ** attempt + Math.random() * BACKOFF_JITTER_MS));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

export type SpotTradeRecord = {
  id: number;
  amountVara: bigint;
  feeVara: bigint;
  timestamp: number;
};

export type StockPositionRecord = {
  id: number;
  marginGvara: bigint;
  leverage: number;
  notionalGvara: bigint;
  isOpen: boolean;
  openedAt: number;
  closedAt: number;
};

// Immutable cache for matched SpotTrade records (`FillSpotOrder` records never mutate after creation).
const spotTradeCache = new Map<number, Promise<SpotTradeRecord | null>>();

/**
 * Decodes a `StonkBaseService::GetSpotTrade(id)` reply buffer into a `SpotTradeRecord`, excluding self-trades (`maker === taker`).
 */
function decodeSpotTrade(raw: Buffer): SpotTradeRecord | null {
  let off = ROUTE_GET_SPOT_TRADE.length;
  if (off >= raw.length || raw[off] === 0) return null;
  off += 1; // Option::Some
  const tradeId = u64LE(raw, off);
  off += 16; // id(8) + order_id(8)
  const { nextOffset: afterPair } = decodeScaleString(raw, off);
  off = afterPair;
  const maker = raw.subarray(off, off + 32).toString("hex");
  off += 32;
  const taker = raw.subarray(off, off + 32).toString("hex");
  off += 32;
  if (maker === taker) return null;
  off += 8; // price_e8(8)
  const amountVara = u128LE(raw, off);
  off += 16;
  const feeVara = u128LE(raw, off);
  off += 16;
  const timestamp = u64LE(raw, off);
  return { id: tradeId, amountVara, feeVara, timestamp };
}

/**
 * Fetches and caches an immutable `SpotTradeRecord` by `id` from `GROWSTREAMS_ORDERBOOK`, evicting failed reads.
 */
function getSpotTrade(id: number): Promise<SpotTradeRecord | null> {
  let p = spotTradeCache.get(id);
  if (!p) {
    const idBuf = Buffer.alloc(8);
    idBuf.writeBigUInt64LE(BigInt(id), 0);
    p = rpcCall(GROWSTREAMS_ORDERBOOK, "0x" + Buffer.concat([ROUTE_GET_SPOT_TRADE, idBuf]).toString("hex"))
      .then(decodeSpotTrade)
      .catch((e) => {
        spotTradeCache.delete(id);
        throw e;
      });
    spotTradeCache.set(id, p);
  }
  return p;
}

/**
 * Binary-searches spot trade IDs `[1, lastId]` to find the first trade with `timestamp >= ts`.
 * `FillSpotOrder` in `agents/contracts/stonkbase-vara-desk/src/lib.rs` assigns sequential `next_trade_id` with `exec::block_timestamp()`, so timestamps are monotonically non-decreasing with ID.
 */
async function firstSpotTradeAtOrAfter(ts: number, lastId: number): Promise<number> {
  let lo = FIRST_LIVE_SPOT_TRADE_ID;
  let hi = lastId + 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    let tradeTs: number | undefined;
    for (let cursor = mid; cursor < hi && tradeTs === undefined; cursor += POOL_CONCURRENCY) {
      const candidateIds = Array.from(
        { length: Math.min(POOL_CONCURRENCY, hi - cursor) },
        (_, i) => cursor + i
      );
      const { results: batchTrades, errors } = await PromisePool.withConcurrency(POOL_CONCURRENCY)
        .for(candidateIds)
        .process(async (id) => ({ id, trade: await getSpotTrade(id) }));
      if (errors.length) throw errors[0];
      batchTrades.sort((a, b) => a.id - b.id);
      for (const item of batchTrades) {
        if (item.trade !== null) {
          tradeTs = item.trade.timestamp;
          break;
        }
      }
    }
    if (tradeTs === undefined || tradeTs >= ts) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/**
 * Returns non-self-trade spot fills on `GROWSTREAMS_ORDERBOOK` with `timestamp` in `[fromTimestamp, toTimestamp)`.
 */
export async function getSpotTrades(options: FetchOptions): Promise<SpotTradeRecord[]> {
  const rawTradesCount = await rpcCall(GROWSTREAMS_ORDERBOOK, "0x" + ROUTE_SPOT_TRADES_COUNT.toString("hex"));
  const totalTrades = u64LE(rawTradesCount, ROUTE_SPOT_TRADES_COUNT.length);
  if (totalTrades === 0) return [];

  const fromTradeId = await firstSpotTradeAtOrAfter(options.fromTimestamp, totalTrades);
  const toTradeId = await firstSpotTradeAtOrAfter(options.toTimestamp, totalTrades);
  const tradeIds = Array.from({ length: Math.max(0, toTradeId - fromTradeId) }, (_, i) => fromTradeId + i);
  const { results, errors } = await PromisePool.withConcurrency(POOL_CONCURRENCY)
    .for(tradeIds)
    .process(async (id) => {
      await new Promise((r) => setTimeout(r, POOL_THROTTLE_BASE_MS + Math.random() * POOL_THROTTLE_JITTER_MS));
      return getSpotTrade(id);
    });
  if (errors.length) throw new Error(`${errors.length}/${tradeIds.length} GetSpotTrade calls failed`);

  return results.filter(
    (t): t is SpotTradeRecord =>
      t !== null && t.timestamp >= options.fromTimestamp && t.timestamp < options.toTimestamp
  );
}

// In-process cache for terminal closed positions (`!isOpen`); open positions are evicted once settled so later fetches observe closures.
const closedPositionCache = new Map<number, Promise<StockPositionRecord | null>>();

// Persistent checkpoints so perps runs do not re-read every position ever opened (the desk exposes no aggregate
// queries, and the public RPC prunes old state, so per-position records are the only refillable source).
// A checkpoint at `asOf` stores the highest position id opened before `asOf` and the ids still open at `asOf`.
// Every other position opened before `asOf` had closed by then, so it cannot count toward volume or open interest in
// any window starting at or after `asOf`. This relies on the desk's records being append-only: ids are assigned in
// `openedAt` order, and a position closes once and is never reopened.
// The cache holds a small state snapshot (bounded by concurrently open positions), not per-window results; a missing,
// unreadable or lost write only means the next run falls back to a full scan.
const CHECKPOINT_CACHE_PROJECT = "vara-grow-streams";
const CHECKPOINT_CACHE_KEY = "perps-open-positions-v1";
// Hourly volume runs and the daily open-interest run both start at the end of an earlier hour; ~2 days of hourly
// checkpoints covers both, plus a short runner outage.
const MAX_CHECKPOINTS = 48;
// Ids read per sequential step when scanning forward for new positions.
const POSITION_SCAN_BATCH = 32;

type PositionCheckpoint = {
  asOf: number; // unix seconds (a window end)
  lastId: number; // highest position id with openedAt < asOf
  openIds: number[]; // ids with openedAt < asOf that were still open at asOf
};

function isCheckpoint(c: any): c is PositionCheckpoint {
  return (
    Number.isInteger(c?.asOf) &&
    Number.isInteger(c?.lastId) &&
    Array.isArray(c?.openIds) &&
    c.openIds.every((id: unknown) => Number.isInteger(id))
  );
}

/**
 * Decodes a `StonkBaseService::GetPosition(id)` reply buffer into a `StockPositionRecord`.
 */
function decodePosition(raw: Buffer): StockPositionRecord | null {
  let off = ROUTE_GET_POSITION.length;
  if (off >= raw.length || raw[off] === 0) return null;
  off += 1; // Option::Some
  const posId = u64LE(raw, off);
  off += 8;
  off += 32; // trader(32)
  off += 1; // is_agent_actor(1)
  const { nextOffset: afterTicker } = decodeScaleString(raw, off);
  off = afterTicker;
  off += 1; // is_long(1)
  const marginGvara = u128LE(raw, off);
  off += 16;
  const leverage = raw[off];
  off += 1;
  const notionalGvara = u128LE(raw, off);
  off += 16;
  off += 32; // entry_price_e8(8) + exit_price_e8(8) + pnl_gvara(16)
  const isOpen = raw[off] !== 0;
  off += 1;
  const openedAt = u64LE(raw, off);
  off += 8;
  const closedAt = u64LE(raw, off);
  return { id: posId, marginGvara, leverage, notionalGvara, isOpen, openedAt, closedAt };
}

/**
 * Fetches a `StockPositionRecord` by `id` from `GROWSTREAMS_PERPS_DESK`, retaining only terminal closed positions (`!isOpen`) in cache.
 */
function getPosition(id: number): Promise<StockPositionRecord | null> {
  let p = closedPositionCache.get(id);
  if (!p) {
    const idBuf = Buffer.alloc(8);
    idBuf.writeBigUInt64LE(BigInt(id), 0);
    p = rpcCall(GROWSTREAMS_PERPS_DESK, "0x" + Buffer.concat([ROUTE_GET_POSITION, idBuf]).toString("hex"))
      .then((raw) => {
        const decoded = decodePosition(raw);
        if (!decoded || decoded.isOpen) {
          closedPositionCache.delete(id);
        }
        return decoded;
      })
      .catch((e) => {
        closedPositionCache.delete(id);
        throw e;
      });
    closedPositionCache.set(id, p);
  }
  return p;
}

/**
 * Reads positions by id (throttled, concurrency-limited), returned in the order of `ids`.
 */
async function readPositions(ids: number[]): Promise<(StockPositionRecord | null)[]> {
  const byId = new Map<number, StockPositionRecord | null>();
  const { errors } = await PromisePool.withConcurrency(POOL_CONCURRENCY)
    .for(ids)
    .process(async (id) => {
      if (!closedPositionCache.has(id)) {
        await new Promise((r) => setTimeout(r, POOL_THROTTLE_BASE_MS + Math.random() * POOL_THROTTLE_JITTER_MS));
      }
      byId.set(id, await getPosition(id));
    });
  if (errors.length) throw new Error(`${errors.length}/${ids.length} GetPosition calls failed`);
  return ids.map((id) => byId.get(id) ?? null);
}

/**
 * Returns every perps position on `GROWSTREAMS_PERPS_DESK` that can count toward volume in
 * `[fromTimestamp, toTimestamp)` or open interest at `toTimestamp`: positions opened before `toTimestamp` that were
 * still open at the newest checkpoint at or before `fromTimestamp` (all live positions when there is none), plus
 * everything opened after that checkpoint. Callers filter by `openedAt`/`closedAt`.
 */
export async function getPerpPositions(options: FetchOptions): Promise<StockPositionRecord[]> {
  const { fromTimestamp, toTimestamp } = options;
  const rawPositionsCount = await rpcCall(GROWSTREAMS_PERPS_DESK, "0x" + ROUTE_POSITIONS_COUNT.toString("hex"));
  const totalPositions = u64LE(rawPositionsCount, ROUTE_POSITIONS_COUNT.length);

  const cached = await getCache(CHECKPOINT_CACHE_PROJECT, CHECKPOINT_CACHE_KEY);
  // Drop malformed checkpoints and any that reference ids past the live count (a different deployment).
  const checkpoints: PositionCheckpoint[] = (Array.isArray(cached?.checkpoints) ? cached.checkpoints : []).filter(
    (c: any) => isCheckpoint(c) && c.lastId <= totalPositions && c.openIds.every((id: number) => id <= c.lastId)
  );
  const base = checkpoints.filter((c) => c.asOf <= fromTimestamp).sort((a, b) => b.asOf - a.asOf)[0];

  // Positions open at the checkpoint, re-read because they may have closed since.
  const carried = base ? (await readPositions(base.openIds)).filter((p): p is StockPositionRecord => p !== null) : [];

  // Positions opened after the checkpoint, in id (= openedAt) order, until the first one opened at/after the window end.
  const fresh: StockPositionRecord[] = [];
  let lastId = base ? base.lastId : FIRST_LIVE_POSITION_ID - 1;
  scan: for (let cursor = lastId + 1; cursor <= totalPositions; cursor += POSITION_SCAN_BATCH) {
    const ids = Array.from({ length: Math.min(POSITION_SCAN_BATCH, totalPositions - cursor + 1) }, (_, i) => cursor + i);
    for (const p of await readPositions(ids)) {
      if (!p) continue;
      if (p.openedAt >= toTimestamp) break scan;
      fresh.push(p);
      lastId = p.id;
    }
  }

  const positions = [...carried, ...fresh];

  // Checkpoint at the window end, only for windows that have already closed so no later position can predate it.
  if (toTimestamp <= Date.now() / 1000) {
    const next: PositionCheckpoint = {
      asOf: toTimestamp,
      lastId,
      openIds: positions.filter((p) => p.isOpen || p.closedAt >= toTimestamp).map((p) => p.id),
    };
    const kept = [...checkpoints.filter((c) => c.asOf !== next.asOf), next]
      .sort((a, b) => a.asOf - b.asOf)
      .slice(-MAX_CHECKPOINTS);
    if (kept.includes(next)) await setCache(CHECKPOINT_CACHE_PROJECT, CHECKPOINT_CACHE_KEY, { checkpoints: kept });
  }

  return positions;
}
