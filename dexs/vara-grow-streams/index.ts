import { PromisePool } from "@supercharge/promise-pool";
import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { postURL } from "../../utils/fetchURL";

const VARA_RPC = "https://rpc.vara.network";

// Vara Mainnet program IDs from `deploy-state.json` in https://github.com/Satyam-10124/growstreams-v3
// GrowStreams Spot CLOB Orderbook (`GROWSTREAMS_ORDERBOOK`): On-chain Central Limit Order Book DEX (`PlaceSpotOrder`, `FillSpotOrder`, `GetSpotTrade`)
const GROWSTREAMS_ORDERBOOK = "0x2c1dd07810480a34b7369fbf0ff0c97651c6db1f26ffc5eaff6490d6b20263cf";
// GrowStreams 5x RWA Perps Desk (`GROWSTREAMS_PERPS_DESK`): On-chain 1x–5x Leveraged RWA Perpetuals & Stock Desk (`OpenStockPosition`, `CloseStockPosition`, `GetPosition`)
const GROWSTREAMS_PERPS_DESK = "0x8073da7aa8e51624ef4c1d41a8e22065cfe8b9ff9e6d5b7f969158397465da81";

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
const BPS_DENOMINATOR = 10_000n;
// Spot CLOB fee constants matching `pub const SPOT_FEE_BPS: u128 = 30` in `agents/contracts/stonkbase-vara-desk/src/lib.rs` (line 12):
// 30 bps (0.30%) total fee split into 25 bps (0.25%) maker/LP rebate and 5 bps (0.05%) protocol treasury fee.
const SPOT_MAKER_REBATE_BPS = 25n;
const SPOT_PROTOCOL_FEE_BPS = 5n;
const SPOT_FEE_BPS = SPOT_MAKER_REBATE_BPS + SPOT_PROTOCOL_FEE_BPS;
// Perpetuals open/close execution fee matching `pub const PERPS_FEE_BPS: u128 = 10` (10 bps = 0.10% on notional) in `agents/contracts/stonkbase-vara-desk/src/lib.rs` (line 13).
const PERPS_FEE_BPS = 10n;
// Post-deployment live cutoff IDs (`Trades #1..#12` and `Positions #1..#7` were initial contract deployment verification records closed on-chain).
const FIRST_LIVE_SPOT_TRADE_ID = 13;
const FIRST_LIVE_POSITION_ID = 8;

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

type SpotTradeRecord = {
  id: number;
  amountVara: bigint;
  feeVara: bigint;
  timestamp: number;
};

type StockPositionRecord = {
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

// Cache for terminal closed positions (`!isOpen`); open positions are evicted once settled so later fetches observe closures.
const closedPositionCache = new Map<number, Promise<StockPositionRecord | null>>();
// Contiguous prefix watermark `[FIRST_LIVE_POSITION_ID..settledPrefixId]` where every position is permanently closed (`!isOpen`), with `settledPrefixMaxClosedAt = max(closedAt)`.
let settledPrefixId = FIRST_LIVE_POSITION_ID - 1;
let settledPrefixMaxClosedAt = 0;

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
 * Binary-searches position IDs `[1, lastId]` to find the first position with `openedAt >= ts`.
 * `OpenStockPosition` in `agents/contracts/stonkbase-vara-desk/src/lib.rs` assigns sequential `next_pos_id` with `exec::block_timestamp()`, so `openedAt` is monotonically non-decreasing with ID.
 */
async function firstPositionOpenedAtOrAfter(ts: number, lastId: number): Promise<number> {
  let lo = FIRST_LIVE_POSITION_ID;
  let hi = lastId + 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    let openedTs: number | undefined;
    for (let cursor = mid; cursor < hi && openedTs === undefined; cursor += POOL_CONCURRENCY) {
      const candidateIds = Array.from(
        { length: Math.min(POOL_CONCURRENCY, hi - cursor) },
        (_, i) => cursor + i
      );
      const { results: batchPositions, errors } = await PromisePool.withConcurrency(POOL_CONCURRENCY)
        .for(candidateIds)
        .process(async (id) => ({ id, pos: await getPosition(id) }));
      if (errors.length) throw errors[0];
      batchPositions.sort((a, b) => a.id - b.id);
      for (const item of batchPositions) {
        if (item.pos !== null) {
          openedTs = item.pos.openedAt;
          break;
        }
      }
    }
    if (openedTs === undefined || openedTs >= ts) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/**
 * Computes GrowStreams daily DEX & Perps volume, open interest, swap fees, protocol revenue, and maker/LP supply-side revenue across `GROWSTREAMS_ORDERBOOK` and `GROWSTREAMS_PERPS_DESK`.
 */
const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const openInterestAtEnd = options.createBalances();

  const [rawTradesCount, rawPositionsCount] = await Promise.all([
    rpcCall(GROWSTREAMS_ORDERBOOK, "0x" + ROUTE_SPOT_TRADES_COUNT.toString("hex")),
    rpcCall(GROWSTREAMS_PERPS_DESK, "0x" + ROUTE_POSITIONS_COUNT.toString("hex")),
  ]);
  const totalTrades = u64LE(rawTradesCount, ROUTE_SPOT_TRADES_COUNT.length);
  const totalPositions = u64LE(rawPositionsCount, ROUTE_POSITIONS_COUNT.length);

  let spotVolumePlancks = 0n;
  let spotFeesPlancks = 0n;
  let spotProtocolRevPlancks = 0n;
  let spotSupplyRevPlancks = 0n;

  if (totalTrades > 0) {
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
    for (const t of results) {
      if (!t) continue;
      if (t.timestamp >= options.fromTimestamp && t.timestamp < options.toTimestamp) {
        spotVolumePlancks += t.amountVara;
        spotFeesPlancks += t.feeVara;
        const supplyShare = (t.feeVara * SPOT_MAKER_REBATE_BPS) / SPOT_FEE_BPS;
        spotSupplyRevPlancks += supplyShare;
        spotProtocolRevPlancks += t.feeVara - supplyShare;
      }
    }
  }

  let perpsVolumePlancks = 0n;
  let perpsFeesPlancks = 0n;
  let openInterestPlancks = 0n;

  if (totalPositions > 0) {
    // Positions opened at or after `options.toTimestamp` neither traded inside `[fromTimestamp, toTimestamp)` nor contributed to open interest at `toTimestamp`.
    const endExclusivePosId = await firstPositionOpenedAtOrAfter(options.toTimestamp, totalPositions);
    const maxPosId = endExclusivePosId - 1;
    // Skip the settled prefix `[FIRST_LIVE_POSITION_ID..settledPrefixId]` when every position in that prefix was already closed strictly before `options.fromTimestamp`.
    const startPosId =
      settledPrefixId >= FIRST_LIVE_POSITION_ID && settledPrefixMaxClosedAt < options.fromTimestamp
        ? Math.min(settledPrefixId + 1, maxPosId + 1)
        : FIRST_LIVE_POSITION_ID;
    const posIds = Array.from({ length: Math.max(0, maxPosId - startPosId + 1) }, (_, i) => startPosId + i);
    const positionsById = new Map<number, StockPositionRecord | null>();
    const { errors } = await PromisePool.withConcurrency(POOL_CONCURRENCY)
      .for(posIds)
      .process(async (id) => {
        if (!closedPositionCache.has(id)) {
          await new Promise((r) => setTimeout(r, POOL_THROTTLE_BASE_MS + Math.random() * POOL_THROTTLE_JITTER_MS));
        }
        const pos = await getPosition(id);
        positionsById.set(id, pos);
        return pos;
      });
    if (errors.length) throw new Error(`${errors.length}/${posIds.length} GetPosition calls failed`);

    // Iterate in ascending `posIds` order so out-of-order PromisePool completions never stop settled-prefix advancement prematurely.
    let canAdvancePrefix = startPosId === settledPrefixId + 1;
    for (const id of posIds) {
      const p = positionsById.get(id) ?? null;
      if (!p) {
        canAdvancePrefix = false;
        continue;
      }
      if (canAdvancePrefix && p.id === settledPrefixId + 1 && !p.isOpen && p.closedAt > 0) {
        settledPrefixId = p.id;
        if (p.closedAt > settledPrefixMaxClosedAt) {
          settledPrefixMaxClosedAt = p.closedAt;
        }
      } else {
        canAdvancePrefix = false;
      }

      if (p.openedAt >= options.fromTimestamp && p.openedAt < options.toTimestamp) {
        perpsVolumePlancks += p.notionalGvara;
        perpsFeesPlancks += (p.notionalGvara * PERPS_FEE_BPS) / BPS_DENOMINATOR;
      }
      if (!p.isOpen && p.closedAt >= options.fromTimestamp && p.closedAt < options.toTimestamp) {
        perpsVolumePlancks += p.notionalGvara;
        perpsFeesPlancks += (p.notionalGvara * PERPS_FEE_BPS) / BPS_DENOMINATOR;
      }
      // Position was open at `toTimestamp` if opened before `toTimestamp` (`p.id <= maxPosId`) and still open or closed at/after `toTimestamp`.
      if (p.openedAt < options.toTimestamp && (p.isOpen || p.closedAt >= options.toTimestamp)) {
        openInterestPlancks += p.notionalGvara;
      }
    }
  }

  const totalVolumeVara = Number(spotVolumePlancks + perpsVolumePlancks) / VARA_DECIMALS;
  const totalFeesVara = Number(spotFeesPlancks + perpsFeesPlancks) / VARA_DECIMALS;
  const totalProtocolRevVara = Number(spotProtocolRevPlancks + perpsFeesPlancks) / VARA_DECIMALS;
  const totalSupplyRevVara = Number(spotSupplyRevPlancks) / VARA_DECIMALS;
  const totalOiVara = Number(openInterestPlancks) / VARA_DECIMALS;

  if (totalVolumeVara > 0) dailyVolume.addCGToken("vara-network", totalVolumeVara);
  if (totalFeesVara > 0) dailyFees.addCGToken("vara-network", totalFeesVara, METRIC.SWAP_FEES);
  if (totalProtocolRevVara > 0) dailyRevenue.addCGToken("vara-network", totalProtocolRevVara, METRIC.PROTOCOL_FEES);
  if (totalSupplyRevVara > 0) dailySupplySideRevenue.addCGToken("vara-network", totalSupplyRevVara, METRIC.LP_FEES);
  if (totalOiVara > 0) openInterestAtEnd.addCGToken("vara-network", totalOiVara);

  return {
    dailyVolume,
    openInterestAtEnd,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume:
    "Sum of matched maker/taker Spot CLOB Orderbook fills on GrowStreams Orderbook (0x2c1dd078...) and 1x-5x leveraged RWA perpetuals positions opened/closed on GrowStreams Perps Desk (0x8073da7a...) on Vara Mainnet.",
  OpenInterest:
    "Sum of active VARA-denominated notional across leveraged RWA perpetual positions on GrowStreams Perps Desk (0x8073da7a...) that remain open at the end of the window.",
  Fees: "0.30% (30 bps) fee paid by takers on Spot CLOB Orderbook fills (0.25% maker/LP rebate + 0.05% protocol fee) and 0.10% (10 bps) execution fee paid by traders on RWA perpetual opens and closes.",
  Revenue:
    "0.05% protocol share of Spot CLOB Orderbook fills plus 0.10% execution fee on RWA perpetual positions.",
  ProtocolRevenue:
    "0.05% protocol share of Spot CLOB Orderbook fills plus 0.10% execution fee on RWA perpetual positions.",
  SupplySideRevenue: "0.25% maker/liquidity-provider rebate on Spot CLOB Orderbook fills.",
};

export const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]:
      "0.30% (30 bps) fee on matched Spot CLOB Orderbook fills plus 0.10% (10 bps) execution fee on RWA perpetual opens and closes.",
  },
  UserFees: {
    [METRIC.SWAP_FEES]:
      "0.30% (30 bps) fee on matched Spot CLOB Orderbook fills plus 0.10% (10 bps) execution fee on RWA perpetual opens and closes.",
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]:
      "Remainder of recorded Spot CLOB trade fees after the 25/30 maker rebate (5 bps) plus 100% of the 0.10% (10 bps) perpetual execution fee.",
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]:
      "Remainder of recorded Spot CLOB trade fees after the 25/30 maker rebate (5 bps) plus 100% of the 0.10% (10 bps) perpetual execution fee.",
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]:
      "25/30 (0.25% = 25 bps) maker/liquidity-provider rebate share of recorded Spot CLOB Orderbook trade fees.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.VARA],
  start: "2026-11-09",
  fetch,
  methodology,
  breakdownMethodology,
};

export default adapter;
