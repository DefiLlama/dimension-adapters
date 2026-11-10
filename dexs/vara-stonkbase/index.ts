import { PromisePool } from "@supercharge/promise-pool";
import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { postURL } from "../../utils/fetchURL";

const VARA_RPC = "https://rpc.vara.network";

// Vara Mainnet program IDs from `deploy-state.json` in https://github.com/Satyam-10124/growstreams-v3
// StonkBase Spot CLOB Orderbook (`stonkbase-orderbook`): On-chain Central Limit Order Book DEX (`PlaceSpotOrder`, `FillSpotOrder`, `GetSpotTrade`)
const STONKBASE_ORDERBOOK = "0x2c1dd07810480a34b7369fbf0ff0c97651c6db1f26ffc5eaff6490d6b20263cf";
// StonkBase 5x RWA Perps Desk (`stonkbase-vara-desk`): On-chain 1x–5x Leveraged RWA Perpetuals & Stock Desk (`OpenStockPosition`, `CloseStockPosition`, `GetPosition`)
const STONKBASE_PERPS_DESK = "0x8073da7aa8e51624ef4c1d41a8e22065cfe8b9ff9e6d5b7f969158397465da81";

const ZERO_ACCOUNT = "0x" + "0".repeat(64);
const GAS_LIMIT = 750000000000;
const VARA_DECIMALS = 1e12;

// Basis-point denominator (10,000 bps = 100%) matching `BPS` in `agents/contracts/stonkbase-vara-desk/src/lib.rs`
const BPS_DENOMINATOR = 10_000n;
// Spot CLOB total fee (30 bps = 0.30%: 25 bps maker/LP rebate + 5 bps protocol revenue)
const SPOT_MAKER_REBATE_BPS = 25n;
const SPOT_PROTOCOL_FEE_BPS = 5n;
// Perpetuals open/close execution fee (10 bps = 0.10% on notional)
const PERPS_FEE_BPS = 10n;

function scaleString(value: string): Buffer {
  const bytes = Buffer.from(value, "utf8");
  return Buffer.concat([Buffer.from([bytes.length << 2]), bytes]);
}

function route(service: string, method: string): Buffer {
  return Buffer.concat([scaleString(service), scaleString(method)]);
}

const ROUTE_SPOT_TRADES_COUNT = route("StonkBaseService", "GetSpotTradesCount");
const ROUTE_GET_SPOT_TRADE = route("StonkBaseService", "GetSpotTrade");
const ROUTE_POSITIONS_COUNT = route("StonkBaseService", "GetPositionsCount");
const ROUTE_GET_POSITION = route("StonkBaseService", "GetPosition");

function u64LE(buf: Buffer, offset = 0): number {
  return Number(buf.readBigUInt64LE(offset));
}

function u128LE(buf: Buffer, offset = 0): bigint {
  return buf.readBigUInt64LE(offset) + (buf.readBigUInt64LE(offset + 8) << 64n);
}

function decodeScaleCompactU32(buf: Buffer, offset: number): { value: number; nextOffset: number } {
  if (offset >= buf.length) throw new Error("unexpected EOF reading SCALE compact integer");
  const mode = buf[offset] & 3;
  if (mode === 0) return { value: buf[offset] >> 2, nextOffset: offset + 1 };
  if (mode === 1) return { value: buf.readUInt16LE(offset) >> 2, nextOffset: offset + 2 };
  if (mode === 2) return { value: buf.readUInt32LE(offset) >>> 2, nextOffset: offset + 4 };
  throw new Error(`unsupported SCALE compact mode ${mode}`);
}

function decodeScaleString(buf: Buffer, offset: number): { value: string; nextOffset: number } {
  const { value: byteLen, nextOffset: start } = decodeScaleCompactU32(buf, offset);
  const end = start + byteLen;
  if (end > buf.length) throw new Error("unexpected EOF reading SCALE string");
  return { value: buf.subarray(start, end).toString("utf8"), nextOffset: end };
}

async function rpcCall(program: string, payloadHex: string): Promise<Buffer> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res: any = await postURL(
        VARA_RPC,
        {
          jsonrpc: "2.0",
          id: 1,
          method: "gear_calculateReplyForHandle",
          params: [ZERO_ACCOUNT, program, payloadHex, GAS_LIMIT, 0],
        },
        1
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
      if (attempt < 5 && (msg.includes("429") || msg.includes("Too Many Requests") || attempt < 2)) {
        await new Promise((r) => setTimeout(r, 400 * 2 ** attempt + Math.random() * 200));
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

async function getSpotTrade(id: number): Promise<SpotTradeRecord | null> {
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(BigInt(id));
  const raw = await rpcCall(STONKBASE_ORDERBOOK, "0x" + Buffer.concat([ROUTE_GET_SPOT_TRADE, idBuf]).toString("hex"));
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

async function getPosition(id: number): Promise<StockPositionRecord | null> {
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(BigInt(id));
  const raw = await rpcCall(STONKBASE_PERPS_DESK, "0x" + Buffer.concat([ROUTE_GET_POSITION, idBuf]).toString("hex"));
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

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const openInterestAtEnd = options.createBalances();

  const [rawTradesCount, rawPositionsCount] = await Promise.all([
    rpcCall(STONKBASE_ORDERBOOK, "0x" + ROUTE_SPOT_TRADES_COUNT.toString("hex")),
    rpcCall(STONKBASE_PERPS_DESK, "0x" + ROUTE_POSITIONS_COUNT.toString("hex")),
  ]);
  const totalTrades = u64LE(rawTradesCount, ROUTE_SPOT_TRADES_COUNT.length);
  const totalPositions = u64LE(rawPositionsCount, ROUTE_POSITIONS_COUNT.length);

  let spotVolumePlancks = 0n;
  let spotFeesPlancks = 0n;
  let spotProtocolRevPlancks = 0n;
  let spotSupplyRevPlancks = 0n;

  if (totalTrades > 0) {
    const tradeIds = Array.from({ length: totalTrades }, (_, i) => i + 1);
    const { results, errors } = await PromisePool.withConcurrency(8)
      .for(tradeIds)
      .process(async (id) => {
        await new Promise((r) => setTimeout(r, 20 + Math.random() * 40));
        return getSpotTrade(id);
      });
    if (errors.length) throw new Error(`${errors.length}/${tradeIds.length} GetSpotTrade calls failed`);
    for (const t of results) {
      if (!t) continue;
      if (t.timestamp >= options.fromTimestamp && t.timestamp < options.toTimestamp) {
        spotVolumePlancks += t.amountVara;
        spotFeesPlancks += t.feeVara;
        spotSupplyRevPlancks += (t.amountVara * SPOT_MAKER_REBATE_BPS) / BPS_DENOMINATOR;
        spotProtocolRevPlancks += (t.amountVara * SPOT_PROTOCOL_FEE_BPS) / BPS_DENOMINATOR;
      }
    }
  }

  let perpsVolumePlancks = 0n;
  let perpsFeesPlancks = 0n;
  let openInterestPlancks = 0n;

  if (totalPositions > 0) {
    const posIds = Array.from({ length: totalPositions }, (_, i) => i + 1);
    const { results, errors } = await PromisePool.withConcurrency(8)
      .for(posIds)
      .process(async (id) => {
        await new Promise((r) => setTimeout(r, 20 + Math.random() * 40));
        return getPosition(id);
      });
    if (errors.length) throw new Error(`${errors.length}/${posIds.length} GetPosition calls failed`);
    for (const p of results) {
      if (!p) continue;
      if (p.openedAt >= options.fromTimestamp && p.openedAt < options.toTimestamp) {
        perpsVolumePlancks += p.notionalGvara;
        perpsFeesPlancks += (p.notionalGvara * PERPS_FEE_BPS) / BPS_DENOMINATOR;
      }
      if (!p.isOpen && p.closedAt >= options.fromTimestamp && p.closedAt < options.toTimestamp) {
        perpsVolumePlancks += p.notionalGvara;
        perpsFeesPlancks += (p.notionalGvara * PERPS_FEE_BPS) / BPS_DENOMINATOR;
      }
      if (p.openedAt <= options.toTimestamp && (p.isOpen || p.closedAt > options.toTimestamp)) {
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
  Volume: "Sum of matched maker/taker Spot CLOB Orderbook fills on stonkbase-orderbook (0x2c1dd078...) and 1x-5x leveraged RWA perpetuals positions opened/closed on stonkbase-vara-desk (0x8073da7a...) on Vara Mainnet.",
  Fees: "0.30% (30 bps) fee on Spot CLOB Orderbook fills (0.25% maker/LP rebate + 0.05% protocol fee) and 0.10% (10 bps) execution fee on RWA perpetual positions.",
  Revenue: "0.05% protocol share of Spot CLOB Orderbook fills plus 0.10% execution fee on RWA perpetual positions.",
  ProtocolRevenue: "0.05% protocol share of Spot CLOB Orderbook fills plus 0.10% execution fee on RWA perpetual positions.",
  SupplySideRevenue: "0.25% maker/liquidity-provider rebate on Spot CLOB Orderbook fills.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.VARA],
  start: "2026-11-09",
  fetch,
  methodology,
};

export default adapter;
