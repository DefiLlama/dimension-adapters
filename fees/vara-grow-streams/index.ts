import { PromisePool } from "@supercharge/promise-pool";
import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { postURL } from "../../utils/fetchURL";

const VARA_RPC = "https://rpc.vara.network";

// Vara Mainnet program IDs from `deploy-state.json` in https://github.com/Satyam-10124/growstreams-v3
// StreamCore (`stream-core`): continuous per-second token streaming engines (V2 legacy + V3 rotated treasury deployment)
const STREAM_CORE_LEGACY = "0x8298c2eea5c6bbe55a9cfe72283b5399098fd6a54d9a2a14c2bedba8eea50659";
const STREAM_CORE_V3 = "0x4ae03ca006e92fe188d3c61d3d39a1d05c9fdf1c0a16c750b103269deccfa784";
const STREAM_CORE_PROGRAMS = [STREAM_CORE_LEGACY, STREAM_CORE_V3] as const;
// BountyAdapter (`bounty-adapter`): AI-verified streaming bounties, Agent Society ACP splits & StonkBase desk settlements
const BOUNTY_ADAPTER = "0x7697bb2e8655e6cd7294389a0289355f48fd5459914d2a735c9966dad548bd4f";

// Supported VARA-pegged & protocol VFT token ActorIds (32-byte hex without 0x prefix) from `deploy-state.json`
// wVARA (`wvara`): 1:1 wrapped native VARA token (`0xf5e9cb1d1e46b0cda6578dd1684b30f281a45dfaa390e4945b7bfc8ab3e27f3d`)
const WVARA = "f5e9cb1d1e46b0cda6578dd1684b30f281a45dfaa390e4945b7bfc8ab3e27f3d";
// gVARA (`gvara-token` V2 & V3): 1:1 VARA-backed streaming SuperTokens
const GVARA_LEGACY = "04314af41b7dbac322e3e66920211d2f799719e1cdc3122a99752f72b6ae84ee";
const GVARA_V3 = "086c7257f39302f9346ed8b7d2839ef1c728fc04997b6056581c0b3f396710ee";
// GROW (`grow-token`): GrowStreams protocol reward & staking token (`0x728d04df91561c66938053a4f5178f749da004ebd219ca05f7c090609a6f7163`)
const GROW = "728d04df91561c66938053a4f5178f749da004ebd219ca05f7c090609a6f7163";
const SUPPORTED_TOKENS = new Set([WVARA, GVARA_LEGACY, GVARA_V3, GROW]);

const ZERO_ACCOUNT = "0x" + "0".repeat(64);
const GAS_LIMIT = 750000000000;
const VARA_DECIMALS = 1e12;

// Basis-point denominator (10,000 bps = 100%) matching `fee_bps: u16` in `contracts/stream-core/stream-core.idl`.
const BPS_DENOMINATOR = 10_000n;
// Score denominator (100 = 100%) matching `min_score: u32` in `contracts/adapters/bounty-adapter/bounty-adapter.idl`.
const SCORE_DENOMINATOR = 100n;
// Maximum leverage multiplier (5x) on StonkBase Stock Desk (`agents/stonkbase/desk.mjs`), used to normalize 5x notional flows to 1x spot margin collateral.
const STONKBASE_MAX_LEVERAGE = 5n;
// Milliseconds per second for converting Gear `exec::block_timestamp()` (`u64` ms) into UNIX seconds.
const MS_PER_SECOND = 1000;
// StreamStatus enum variant indices in `contracts/stream-core/stream-core.idl` (`0 = Active`, `1 = Paused`, `2 = Stopped`).
const STREAM_STATUS_ACTIVE = 0;
const STREAM_STATUS_STOPPED = 2;
// BountyStatus enum variant indices for `Streaming` (2) and `Completed` (3) in `contracts/adapters/bounty-adapter/src/lib.rs`.
const BOUNTY_STATUS_STREAMING = 2;
const BOUNTY_STATUS_COMPLETED = 3;

/**
 * Encodes a short UTF-8 string (< 64 bytes) with its single-byte SCALE compact length prefix.
 */
function scaleString(value: string): Buffer {
  const bytes = Buffer.from(value, "utf8");
  return Buffer.concat([Buffer.from([bytes.length << 2]), bytes]);
}

/**
 * Builds a Sails service/method routing prefix buffer.
 */
function route(service: string, method: string): Buffer {
  return Buffer.concat([scaleString(service), scaleString(method)]);
}

const ROUTE_CONFIG = route("StreamService", "GetConfig");
const ROUTE_GETSTREAM = route("StreamService", "GetStream");
const ROUTE_TOTAL_BOUNTIES = route("BountyService", "TotalBounties");
const ROUTE_GET_BOUNTY = route("BountyService", "GetBounty");

/**
 * Reads an unsigned 64-bit little-endian integer as a JS number.
 */
function u64LE(buf: Buffer, offset = 0): number {
  return Number(buf.readBigUInt64LE(offset));
}

/**
 * Reads an unsigned 128-bit little-endian integer as a bigint.
 */
function u128LE(buf: Buffer, offset = 0): bigint {
  return buf.readBigUInt64LE(offset) + (buf.readBigUInt64LE(offset + 8) << 64n);
}

/**
 * Decodes a SCALE compact-encoded unsigned integer starting at `offset` in `buf`.
 */
function decodeScaleCompactU32(buf: Buffer, offset: number): { value: number; nextOffset: number } {
  if (offset >= buf.length) throw new Error("unexpected EOF reading SCALE compact integer");
  const mode = buf[offset] & 3;
  if (mode === 0) {
    return { value: buf[offset] >> 2, nextOffset: offset + 1 };
  }
  if (mode === 1) {
    if (offset + 2 > buf.length) throw new Error("unexpected EOF in 2-byte SCALE compact integer");
    return { value: buf.readUInt16LE(offset) >> 2, nextOffset: offset + 2 };
  }
  if (mode === 2) {
    if (offset + 4 > buf.length) throw new Error("unexpected EOF in 4-byte SCALE compact integer");
    return { value: buf.readUInt32LE(offset) >>> 2, nextOffset: offset + 4 };
  }
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
 */
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

type Stream = {
  token: string;
  startTime: number;
  lastUpdate: number;
  deposited: bigint;
  streamed: bigint;
  status: number;
};
type BountyRecord = {
  id: number;
  title: string;
  token: string;
  maxFlowRate: bigint;
  minScore: number;
  totalBudget: bigint;
  spent: bigint;
  activeStream: number | null;
  status: number;
  createdAt: number;
};

/**
 * Decodes `StreamService::GetConfig` reply to extract `nextStreamId` and `feeBps`.
 */
function decodeConfig(buf: Buffer): { nextStreamId: number; feeBps: number } {
  if (!buf.subarray(0, ROUTE_CONFIG.length).equals(ROUTE_CONFIG)) throw new Error("malformed GetConfig");
  const rest = buf.subarray(ROUTE_CONFIG.length);
  if (rest.length < 86) throw new Error("short GetConfig payload");
  // admin(32) minBuffer(8) nextStreamId(8) tokenVault(32) superTokenCount(4) feeBps(2)
  return { nextStreamId: u64LE(rest, 40), feeBps: rest.readUInt16LE(84) };
}

/**
 * Decodes `StreamService::GetStream(id)` reply into a `Stream` record including settlement timestamps, caps, and status.
 */
function decodeStream(buf: Buffer): Stream | null {
  if (!buf.subarray(0, ROUTE_GETSTREAM.length).equals(ROUTE_GETSTREAM)) throw new Error("malformed GetStream");
  const rest = buf.subarray(ROUTE_GETSTREAM.length);
  if (rest.length === 0 || rest[0] === 0) return null;
  if (rest[0] !== 1 || rest.length < 186) throw new Error(`unexpected GetStream payload (opt=${rest[0]}, len=${rest.length})`);
  // opt(1) id(8) sender(32) receiver(32) token(32) flowRate(16) startTime(8) lastUpdate(8) deposited(16) withdrawn(16) streamed(16) status(1)
  const token = rest.subarray(73, 105).toString("hex");
  const startTime = u64LE(rest, 121);
  const lastUpdate = u64LE(rest, 129);
  const deposited = u128LE(rest, 137);
  const streamed = u128LE(rest, 169);
  const status = rest[185];
  return { token, startTime, lastUpdate, deposited, streamed, status };
}

/**
 * Sequentially decodes `BountyService::GetBounty(id)` reply matching `struct Bounty` in `contracts/adapters/bounty-adapter/src/lib.rs`.
 */
function decodeBounty(buf: Buffer): BountyRecord | null {
  if (!buf.subarray(0, ROUTE_GET_BOUNTY.length).equals(ROUTE_GET_BOUNTY)) throw new Error("malformed GetBounty");
  const rest = buf.subarray(ROUTE_GET_BOUNTY.length);
  if (rest.length === 0 || rest[0] === 0) return null;
  if (rest[0] !== 1 || rest.length < 42) throw new Error(`unexpected GetBounty opt ${rest[0]}`);

  // 1. opt(1) + id: u64 (8) + creator: ActorId (32) + title: String (SCALE compact)
  const id = u64LE(rest, 1);
  const { value: title, nextOffset: afterTitle } = decodeScaleString(rest, 41);

  // 2. token: ActorId (32) + max_flow_rate: u128 (16) + min_score: u32 (4) + total_budget: u128 (16) + spent: u128 (16) = 84 bytes
  let pos = afterTitle;
  if (pos + 84 > rest.length) throw new Error("malformed GetBounty numeric fields");
  const token = rest.subarray(pos, pos + 32).toString("hex");
  pos += 32;
  const maxFlowRate = u128LE(rest, pos);
  pos += 16;
  const minScore = rest.readUInt32LE(pos);
  pos += 4;
  const totalBudget = u128LE(rest, pos);
  pos += 16;
  const spent = u128LE(rest, pos);
  pos += 16;

  // 3. active_stream: Option<u64>
  if (pos >= rest.length) throw new Error("malformed GetBounty active_stream tag");
  const hasActiveStream = rest[pos++];
  let activeStream: number | null = null;
  if (hasActiveStream === 1) {
    if (pos + 8 > rest.length) throw new Error("malformed GetBounty active_stream value");
    activeStream = u64LE(rest, pos);
    pos += 8;
  } else if (hasActiveStream !== 0) {
    throw new Error(`unexpected GetBounty active_stream tag ${hasActiveStream}`);
  }

  // 4. claimer: Option<ActorId>
  if (pos >= rest.length) throw new Error("malformed GetBounty claimer tag");
  const hasClaimer = rest[pos++];
  if (hasClaimer === 1) {
    if (pos + 32 > rest.length) throw new Error("malformed GetBounty claimer value");
    pos += 32;
  } else if (hasClaimer !== 0) {
    throw new Error(`unexpected GetBounty claimer tag ${hasClaimer}`);
  }

  // 5. status: BountyStatus (1) + created_at: u64 (8, milliseconds from `exec::block_timestamp()`)
  if (pos + 9 > rest.length) throw new Error("malformed GetBounty status/created_at");
  const status = rest[pos++];
  const createdAt = Math.floor(u64LE(rest, pos) / MS_PER_SECOND);

  return { id, title, token, maxFlowRate, minScore, totalBudget, spent, activeStream, status, createdAt };
}

const configCache = new Map<string, Promise<{ nextStreamId: number; feeBps: number }>>();
/**
 * Fetches `StreamCore` configuration (`nextStreamId` and `feeBps`) for a given `program`, sharing only concurrent in-flight requests and evicting once settled.
 */
function getConfig(program: string) {
  let p = configCache.get(program);
  if (!p) {
    p = rpcCall(program, "0x" + ROUTE_CONFIG.toString("hex"))
      .then(decodeConfig)
      .finally(() => {
        configCache.delete(program);
      });
    configCache.set(program, p);
  }
  return p;
}

const streamCache = new Map<string, Promise<Stream | null>>();
/**
 * Fetches an individual stream from `StreamCore` (`program`) by ID, retaining only terminal stopped streams in cache and evicting active/paused or failed reads once settled.
 */
function getStream(program: string, id: number) {
  const key = `${program}:${id}`;
  let p = streamCache.get(key);
  if (!p) {
    const idBuf = Buffer.alloc(8);
    idBuf.writeBigUInt64LE(BigInt(id), 0);
    p = rpcCall(program, "0x" + Buffer.concat([ROUTE_GETSTREAM, idBuf]).toString("hex"))
      .then((buf) => {
        const decoded = decodeStream(buf);
        if (!decoded || decoded.status !== STREAM_STATUS_STOPPED) {
          streamCache.delete(key);
        }
        return decoded;
      })
      .catch((e) => {
        streamCache.delete(key);
        throw e;
      });
    streamCache.set(key, p);
  }
  return p;
}

/**
 * Binary-searches `StreamCore` (`program`) stream IDs to find the first stream with `startTime >= ts`.
 */
async function firstStreamAtOrAfter(program: string, ts: number, lastId: number): Promise<number> {
  let lo = 1;
  let hi = lastId + 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    let start: number | undefined;
    for (let id = mid; id < hi && start === undefined; id++) start = (await getStream(program, id))?.startTime;
    if (start === undefined || start >= ts) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

let bountiesCache: Promise<BountyRecord[]> | undefined;

/**
 * Fetches all `BountyRecord` entries from `BountyAdapter`, sharing only concurrent in-flight requests and evicting once settled so subsequent fetches observe new or updated bounty state.
 */
function getBountiesSnapshot(): Promise<BountyRecord[]> {
  if (!bountiesCache) {
    bountiesCache = (async () => {
      const totalBountiesBuf = await rpcCall(BOUNTY_ADAPTER, "0x" + ROUTE_TOTAL_BOUNTIES.toString("hex"));
      if (!totalBountiesBuf.subarray(0, ROUTE_TOTAL_BOUNTIES.length).equals(ROUTE_TOTAL_BOUNTIES)) {
        throw new Error("malformed TotalBounties");
      }
      const totalBounties = u64LE(totalBountiesBuf, ROUTE_TOTAL_BOUNTIES.length);
      const bountyIds = Array.from({ length: totalBounties }, (_, i) => i + 1);
      const { results: bountyResults, errors: bountyErrors } = await PromisePool.withConcurrency(6)
        .for(bountyIds)
        .process(async (id) => {
          const idBuf = Buffer.alloc(8);
          idBuf.writeBigUInt64LE(BigInt(id), 0);
          const reply = await rpcCall(BOUNTY_ADAPTER, "0x" + Buffer.concat([ROUTE_GET_BOUNTY, idBuf]).toString("hex"));
          return decodeBounty(reply);
        });
      if (bountyErrors.length) throw new Error(`${bountyErrors.length}/${bountyIds.length} GetBounty calls failed`);
      return bountyResults.filter((b): b is BountyRecord => Boolean(b));
    })().finally(() => {
      bountiesCache = undefined;
    });
  }
  return bountiesCache;
}

/**
 * Computes GrowStreams daily volume, fees, and protocol revenue across `StreamCore` deployments and `BountyAdapter` (including StonkBase 1x spot margin & Agent Society ACP streams).
 */
const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyVolume = options.createBalances();
  const [configs, bounties] = await Promise.all([
    Promise.all(STREAM_CORE_PROGRAMS.map((program) => getConfig(program).then((cfg) => ({ program, ...cfg })))),
    getBountiesSnapshot(),
  ]);
  const legacyConfig = configs.find((c) => c.program === STREAM_CORE_LEGACY);
  if (!legacyConfig) {
    throw new Error("missing STREAM_CORE_LEGACY configuration");
  }
  const legacyFeeBps = legacyConfig.feeBps;

  // 1. StreamCore streams created in [fromTimestamp, toTimestamp) across V2 & V3 StreamCore programs
  let volumePlancks = 0n;
  let feesPlancks = 0n;
  for (const { program, nextStreamId, feeBps } of configs) {
    const lastId = nextStreamId - 1;
    if (lastId < 1) continue;
    const fromId = await firstStreamAtOrAfter(program, options.fromTimestamp, lastId);
    const toId = await firstStreamAtOrAfter(program, options.toTimestamp, lastId);
    const ids = Array.from({ length: Math.max(0, toId - fromId) }, (_, i) => fromId + i);
    const { results, errors } = await PromisePool.withConcurrency(10)
      .for(ids)
      .process(async (id) => {
        await new Promise((r) => setTimeout(r, 40 + Math.random() * 80));
        return getStream(program, id);
      });
    if (errors.length) throw new Error(`${errors.length}/${ids.length} GetStream calls failed on ${program}`);

    let programVolumePlancks = 0n;
    for (const s of results) {
      if (!s || !SUPPORTED_TOKENS.has(s.token.toLowerCase())) continue;
      if (s.startTime >= options.fromTimestamp && s.startTime < options.toTimestamp) {
        programVolumePlancks += s.deposited;
      }
    }
    volumePlancks += programVolumePlancks;
    feesPlancks += (programVolumePlancks * BigInt(feeBps)) / BPS_DENOMINATOR;
  }

  // 2. BountyAdapter AI-verified streaming & completed bounties, Agent Society ACP splits & StonkBase 1x spot collateral in [fromTimestamp, toTimestamp)
  // `verify_and_start_stream` maps `pseudo_stream_id = bounty_id` 1:1 in `contracts/adapters/bounty-adapter/src/lib.rs`, so completed bounties (which clear `active_stream = None`) still resolve their historical StreamCore settlement record via `b.activeStream ?? b.id`.
  const eligibleBounties = bounties.filter(
    (b) =>
      SUPPORTED_TOKENS.has(b.token.toLowerCase()) &&
      (b.status === BOUNTY_STATUS_STREAMING || b.status === BOUNTY_STATUS_COMPLETED),
  );
  const linkedStreamIds = Array.from(new Set(eligibleBounties.map((b) => b.activeStream ?? b.id)));
  const linkedStreamsById = new Map<number, Stream | null>();
  const { errors: linkedErrors } = await PromisePool.withConcurrency(6)
    .for(linkedStreamIds)
    .process(async (id) => {
      const s = await getStream(STREAM_CORE_LEGACY, id);
      linkedStreamsById.set(id, s);
      return s;
    });
  if (linkedErrors.length) throw new Error(`${linkedErrors.length}/${linkedStreamIds.length} linked GetStream calls failed`);

  let bountyVolumePlancks = 0n;
  for (const b of eligibleBounties) {
    // Matches `flow_rate = (bounty.max_flow_rate * score as u128) / 100` in `contracts/adapters/bounty-adapter/src/lib.rs`
    const rawVerifiedFlowRate = (b.maxFlowRate * BigInt(b.minScore)) / SCORE_DENOMINATOR;
    if (rawVerifiedFlowRate <= 0n || b.totalBudget <= 0n) continue;

    // Enforce cumulative budget cap across periods (using `b.spent` if recorded on completion and `< b.totalBudget`)
    const rawBudgetCap = b.spent > 0n && b.spent < b.totalBudget ? b.spent : b.totalBudget;

    // Normalize 5x leveraged StonkBase synthetic equity flows by STONKBASE_MAX_LEVERAGE (5x) so only 1x unleveraged spot margin collateral is counted
    const isLeveragedDesk = b.title.includes("5X_LEVERAGED");
    const effectiveFlowRate = isLeveragedDesk ? rawVerifiedFlowRate / STONKBASE_MAX_LEVERAGE : rawVerifiedFlowRate;
    let effectiveBudgetCap = isLeveragedDesk ? rawBudgetCap / STONKBASE_MAX_LEVERAGE : rawBudgetCap;
    if (effectiveFlowRate <= 0n || effectiveBudgetCap <= 0n) continue;

    // Resolve the linked StreamCore settlement record (`b.activeStream ?? b.id`), skipping if absent
    const linkedStream = linkedStreamsById.get(b.activeStream ?? b.id) ?? null;
    if (!linkedStream) continue;

    // If the underlying StreamCore stream has settled/stopped, enforce its on-chain settled cap (`streamed`) across periods
    const isStreamEnded = linkedStream.status === STREAM_STATUS_STOPPED || b.status === BOUNTY_STATUS_COMPLETED;
    if (isStreamEnded && linkedStream.streamed > 0n) {
      const settledCap = isLeveragedDesk ? linkedStream.streamed / STONKBASE_MAX_LEVERAGE : linkedStream.streamed;
      if (settledCap > 0n && settledCap < effectiveBudgetCap) {
        effectiveBudgetCap = settledCap;
      }
    }

    const streamStart = Math.max(linkedStream.startTime, b.createdAt);
    const durationSecondsBig = (effectiveBudgetCap + effectiveFlowRate - 1n) / effectiveFlowRate;
    const streamStartBig = BigInt(streamStart);
    const budgetEndBig = streamStartBig + durationSecondsBig;

    // Stop accrual at the actual on-chain completion/settlement timestamp (`linkedStream.lastUpdate`) when the stream or bounty has ended early
    if (isStreamEnded && linkedStream.lastUpdate <= streamStart) continue;
    const actualEndBig =
      isStreamEnded && BigInt(linkedStream.lastUpdate) < budgetEndBig
        ? BigInt(linkedStream.lastUpdate)
        : budgetEndBig;

    // Skip if `[fromTimestamp, toTimestamp)` does not overlap the active settlement period `[streamStartBig, actualEndBig)`
    if (BigInt(options.toTimestamp) <= streamStartBig || BigInt(options.fromTimestamp) >= actualEndBig) continue;

    // Clamp window boundaries to `actualEndBig` and enforce `effectiveBudgetCap` across all settlement periods
    const clampedFromBig = BigInt(options.fromTimestamp) < actualEndBig ? BigInt(options.fromTimestamp) : actualEndBig;
    const clampedToBig = BigInt(options.toTimestamp) < actualEndBig ? BigInt(options.toTimestamp) : actualEndBig;
    const elapsedBefore = clampedFromBig > streamStartBig ? clampedFromBig - streamStartBig : 0n;
    const elapsedUntilEnd = clampedToBig > streamStartBig ? clampedToBig - streamStartBig : 0n;
    const uncappedBefore = elapsedBefore * effectiveFlowRate;
    const uncappedUntilEnd = elapsedUntilEnd * effectiveFlowRate;
    const accruedBefore = uncappedBefore < effectiveBudgetCap ? uncappedBefore : effectiveBudgetCap;
    const accruedUntilEnd = uncappedUntilEnd < effectiveBudgetCap ? uncappedUntilEnd : effectiveBudgetCap;

    if (accruedUntilEnd > accruedBefore) {
      bountyVolumePlancks += accruedUntilEnd - accruedBefore;
    }
  }
  volumePlancks += bountyVolumePlancks;
  feesPlancks += (bountyVolumePlancks * BigInt(legacyFeeBps)) / BPS_DENOMINATOR;

  if (volumePlancks > 0n) {
    // Fee routing verified in `contracts/stream-core/stream-core.idl` (`Config.fee_bps = 250`, `Config.treasury`) and `contracts/super-token/src/lib.rs` (`SuperTokenService::collect_fee` lines 682-701):
    // `state.debit(from, amount); state.credit(treasury, amount);` — 100% of protocol service fees go directly to the GrowStreams protocol treasury (`Config.treasury`) with 0% supply-side or token-holder share.
    const feesVara = Number(feesPlancks) / VARA_DECIMALS;
    const volumeVara = Number(volumePlancks) / VARA_DECIMALS;
    dailyFees.addCGToken("vara-network", feesVara, METRIC.SERVICE_FEES);
    dailyRevenue.addCGToken("vara-network", feesVara, METRIC.SERVICE_FEES);
    dailyVolume.addCGToken("vara-network", volumeVara);
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailyVolume };
};

const methodology = {
  Fees: "Users and autonomous agents pay fee_bps (StreamService::GetConfig, currently 250 = 2.5%) on StreamCore deposits and bounded per-window settlements across BountyAdapter (including Agent Society ACP splits and StonkBase 1x spot margin flows).",
  Revenue: "100% of the 2.5% streaming and settlement fee is routed to the GrowStreams protocol treasury.",
  ProtocolRevenue: "100% of the 2.5% streaming and settlement fee is routed to the GrowStreams protocol treasury.",
  Volume: "VARA-denominated value deposited and streamed within the window across StreamCore and verified active BountyAdapter streams (including Agent Society ACP splits and StonkBase 1x spot margin collateral, strictly bounded by each bounty's total_budget cap).",
};

export const breakdownMethodology = {
  Fees: {
    [METRIC.SERVICE_FEES]: "Per-window streamed and deposited volume * fee_bps / 10_000 across StreamCore and BountyAdapter.",
  },
  Revenue: {
    [METRIC.SERVICE_FEES]: "Full 2.5% protocol fee routed to the GrowStreams treasury; no supply-side cut.",
  },
  ProtocolRevenue: {
    [METRIC.SERVICE_FEES]: "Full 2.5% protocol fee routed to the GrowStreams treasury; no supply-side cut.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.VARA],
  // First StreamCreated is 2026-06-21; start one day earlier so hourly backfill covers that full day.
  start: "2026-06-20",
  fetch,
  methodology,
  breakdownMethodology,
};

export default adapter;
