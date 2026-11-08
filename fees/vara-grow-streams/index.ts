import { PromisePool } from "@supercharge/promise-pool";
import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { postURL } from "../../utils/fetchURL";

const VARA_RPC = "https://rpc.vara.network";

// Vara Mainnet program IDs from `deploy-state.json` in https://github.com/Satyam-10124/growstreams-v3
// StreamCore (`stream-core`): continuous per-second token streaming engine
const STREAM_CORE = "0x8298c2eea5c6bbe55a9cfe72283b5399098fd6a54d9a2a14c2bedba8eea50659";
// TokenVault (`token-vault`): native VARA & VFT collateral custody vault
const TOKEN_VAULT = "0x657cf9c4f929aeac97092037826c1117f9e6cd0e3c4edc44e49decc17b840aa9";
// SplitsRouter (`splits-router`): multi-recipient 60/15/15/10 agent squad revenue router
const SPLITS_ROUTER = "0x68b9fd8f53f6557db2c26b5b9a7c63061bb7f36d379dc843b8a53e78f5692f45";
// BountyAdapter (`bounty-adapter`): AI-verified streaming bounties & protocol pillar settlements
const BOUNTY_ADAPTER = "0x7697bb2e8655e6cd7294389a0289355f48fd5459914d2a735c9966dad548bd4f";
// PermissionManager (`permission-manager`): autonomous agent execution & delegation permissions
const PERMISSION_MANAGER = "0x52f4299e964dab5e97c91cdd10e2d6e635b19696ab8389889aabceba3de9e581";

// Supported VARA-pegged & protocol VFT token ActorIds (32-byte hex without 0x prefix) from `deploy-state.json`
// wVARA (`wvara`): 1:1 wrapped native VARA token (`0xf5e9cb1d1e46b0cda6578dd1684b30f281a45dfaa390e4945b7bfc8ab3e27f3d`)
const WVARA = "f5e9cb1d1e46b0cda6578dd1684b30f281a45dfaa390e4945b7bfc8ab3e27f3d";
// gVARA (`gvara-token`): 1:1 VARA-backed streaming SuperToken (`0x04314af41b7dbac322e3e66920211d2f799719e1cdc3122a99752f72b6ae84ee`)
const GVARA = "04314af41b7dbac322e3e66920211d2f799719e1cdc3122a99752f72b6ae84ee";
// GROW (`grow-token`): GrowStreams protocol reward & staking token (`0x728d04df91561c66938053a4f5178f749da004ebd219ca05f7c090609a6f7163`)
const GROW = "728d04df91561c66938053a4f5178f749da004ebd219ca05f7c090609a6f7163";
const SUPPORTED_TOKENS = new Set([WVARA, GVARA, GROW]);

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
// BountyStatus enum variant index for `Streaming` (2) in `contracts/adapters/bounty-adapter/src/lib.rs`.
const BOUNTY_STATUS_STREAMING = 2;

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
const ROUTE_TOTAL_GROUPS = route("SplitsService", "TotalGroups");
const ROUTE_GET_GROUP = route("SplitsService", "GetSplitGroup");
const ROUTE_GET_DISTRIBUTED = route("SplitsService", "GetTotalDistributed");
const ROUTE_VAULT_CONFIG = route("VaultService", "GetConfig");
const ROUTE_TOTAL_PERMS = route("PermissionService", "TotalPermissions");

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

type Stream = { token: string; startTime: number; deposited: bigint };
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
type SplitGroupRecord = {
  id: number;
  createdAt: number;
  updatedAt: number;
  totalDistributed: bigint;
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
 * Decodes `StreamService::GetStream(id)` reply into a `Stream` record.
 */
function decodeStream(buf: Buffer): Stream | null {
  if (!buf.subarray(0, ROUTE_GETSTREAM.length).equals(ROUTE_GETSTREAM)) throw new Error("malformed GetStream");
  const rest = buf.subarray(ROUTE_GETSTREAM.length);
  if (rest.length === 0 || rest[0] === 0) return null;
  if (rest[0] !== 1 || rest.length < 153) throw new Error(`unexpected GetStream payload (opt=${rest[0]}, len=${rest.length})`);
  // opt(1) id(8) sender(32) receiver(32) token(32) flowRate(16) startTime(8) lastUpdate(8) deposited(16)
  const token = rest.subarray(73, 105).toString("hex");
  const startTime = u64LE(rest, 121);
  const deposited = u128LE(rest, 137);
  return { token, startTime, deposited };
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

/**
 * Sequentially decodes `SplitsService::GetSplitGroup(id)` and `SplitsService::GetTotalDistributed(id)` replies
 * matching `struct SplitGroup` in `contracts/splits-router/src/lib.rs`.
 */
function decodeSplitGroup(grpBuf: Buffer, distBuf: Buffer): SplitGroupRecord | null {
  if (!grpBuf.subarray(0, ROUTE_GET_GROUP.length).equals(ROUTE_GET_GROUP)) throw new Error("malformed GetSplitGroup");
  if (!distBuf.subarray(0, ROUTE_GET_DISTRIBUTED.length).equals(ROUTE_GET_DISTRIBUTED)) {
    throw new Error("malformed GetTotalDistributed");
  }

  const grpRest = grpBuf.subarray(ROUTE_GET_GROUP.length);
  if (grpRest.length === 0 || grpRest[0] === 0) return null;
  if (grpRest[0] !== 1 || grpRest.length < 42) throw new Error(`unexpected GetSplitGroup opt ${grpRest[0]}`);

  // 1. opt(1) + id: u64 (8) + owner: ActorId (32) + recipients: Vec<SplitRecipient> (compact len + N * 36 bytes)
  const id = u64LE(grpRest, 1);
  const { value: recipientCount, nextOffset: afterCount } = decodeScaleCompactU32(grpRest, 41);
  let pos = afterCount + recipientCount * 36;

  // 2. total_weight: u32 (4) + created_at: u64 (8, ms) + updated_at: u64 (8, ms)
  if (pos + 20 > grpRest.length) throw new Error("malformed GetSplitGroup trailing fields");
  pos += 4; // skip total_weight
  const createdAt = Math.floor(u64LE(grpRest, pos) / MS_PER_SECOND);
  pos += 8;
  const updatedAt = Math.floor(u64LE(grpRest, pos) / MS_PER_SECOND);

  const distRest = distBuf.subarray(ROUTE_GET_DISTRIBUTED.length);
  if (distRest.length < 16) throw new Error("short GetTotalDistributed payload");
  const totalDistributed = u128LE(distRest, 0);

  return { id, createdAt, updatedAt, totalDistributed };
}

let configCache: Promise<{ nextStreamId: number; feeBps: number }> | undefined;
/**
 * Fetches and caches `StreamCore` configuration (`nextStreamId` and `feeBps`).
 */
function getConfig() {
  if (!configCache) {
    configCache = rpcCall(STREAM_CORE, "0x" + ROUTE_CONFIG.toString("hex"))
      .then(decodeConfig)
      .catch((e) => {
        configCache = undefined;
        throw e;
      });
  }
  return configCache;
}

const streamCache = new Map<number, Promise<Stream | null>>();
/**
 * Fetches and caches an individual stream from `StreamCore` by ID.
 */
function getStream(id: number) {
  let p = streamCache.get(id);
  if (!p) {
    const idBuf = Buffer.alloc(8);
    idBuf.writeBigUInt64LE(BigInt(id), 0);
    p = rpcCall(STREAM_CORE, "0x" + Buffer.concat([ROUTE_GETSTREAM, idBuf]).toString("hex")).then(decodeStream);
    p.catch(() => streamCache.delete(id));
    streamCache.set(id, p);
  }
  return p;
}

/**
 * Binary-searches `StreamCore` stream IDs to find the first stream with `startTime >= ts`.
 */
async function firstStreamAtOrAfter(ts: number, lastId: number): Promise<number> {
  let lo = 1;
  let hi = lastId + 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    let start: number | undefined;
    for (let id = mid; id < hi && start === undefined; id++) start = (await getStream(id))?.startTime;
    if (start === undefined || start >= ts) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

let multiContractCache:
  | Promise<{
      bounties: BountyRecord[];
      splitGroups: SplitGroupRecord[];
      vaultTokensHeld: bigint;
      totalPermissions: number;
    }>
  | undefined;

/**
 * Fetches and caches on-chain state from `BountyAdapter`, `SplitsRouter`, `TokenVault`, and `PermissionManager`.
 */
function getMultiContractSnapshot() {
  if (!multiContractCache) {
    multiContractCache = (async () => {
      // 1. BountyAdapter: read TotalBounties & all Bounty records
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
      const bounties = bountyResults.filter((b): b is BountyRecord => Boolean(b));

      // 2. SplitsRouter: read TotalGroups, GetSplitGroup & GetTotalDistributed
      const totalGroupsBuf = await rpcCall(SPLITS_ROUTER, "0x" + ROUTE_TOTAL_GROUPS.toString("hex"));
      if (!totalGroupsBuf.subarray(0, ROUTE_TOTAL_GROUPS.length).equals(ROUTE_TOTAL_GROUPS)) {
        throw new Error("malformed TotalGroups");
      }
      const totalGroups = u64LE(totalGroupsBuf, ROUTE_TOTAL_GROUPS.length);
      const groupIds = Array.from({ length: totalGroups }, (_, i) => i + 1);
      const { results: splitResults, errors: splitErrors } = await PromisePool.withConcurrency(6)
        .for(groupIds)
        .process(async (id) => {
          const idBuf = Buffer.alloc(8);
          idBuf.writeBigUInt64LE(BigInt(id), 0);
          const [grpReply, distReply] = await Promise.all([
            rpcCall(SPLITS_ROUTER, "0x" + Buffer.concat([ROUTE_GET_GROUP, idBuf]).toString("hex")),
            rpcCall(SPLITS_ROUTER, "0x" + Buffer.concat([ROUTE_GET_DISTRIBUTED, idBuf]).toString("hex")),
          ]);
          return decodeSplitGroup(grpReply, distReply);
        });
      if (splitErrors.length) throw new Error(`${splitErrors.length}/${groupIds.length} split group calls failed`);
      const splitGroups = splitResults.filter((g): g is SplitGroupRecord => Boolean(g));

      // 3. TokenVault & PermissionManager state verification
      const [vaultCfgBuf, permsBuf] = await Promise.all([
        rpcCall(TOKEN_VAULT, "0x" + ROUTE_VAULT_CONFIG.toString("hex")),
        rpcCall(PERMISSION_MANAGER, "0x" + ROUTE_TOTAL_PERMS.toString("hex")),
      ]);
      if (!vaultCfgBuf.subarray(0, ROUTE_VAULT_CONFIG.length).equals(ROUTE_VAULT_CONFIG)) {
        throw new Error("malformed VaultService::GetConfig");
      }
      if (!permsBuf.subarray(0, ROUTE_TOTAL_PERMS.length).equals(ROUTE_TOTAL_PERMS)) {
        throw new Error("malformed PermissionService::TotalPermissions");
      }
      const vaultRest = vaultCfgBuf.subarray(ROUTE_VAULT_CONFIG.length);
      const vaultTokensHeld = vaultRest.length >= 81 ? u128LE(vaultRest, 65) : 0n;
      const totalPermissions = u64LE(permsBuf, ROUTE_TOTAL_PERMS.length);

      return { bounties, splitGroups, vaultTokensHeld, totalPermissions };
    })().catch((e) => {
      multiContractCache = undefined;
      throw e;
    });
  }
  return multiContractCache;
}

/**
 * Computes GrowStreams daily volume, fees, and protocol revenue across `StreamCore`, `BountyAdapter` (including StonkBase 1x spot margin & Agent Society ACP streams), `SplitsRouter`, and `TokenVault`.
 */
const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyVolume = options.createBalances();
  const [{ nextStreamId, feeBps }, { bounties }] = await Promise.all([
    getConfig(),
    getMultiContractSnapshot(),
  ]);
  const lastId = nextStreamId - 1;

  // 1. StreamCore streams created in [fromTimestamp, toTimestamp)
  const fromId = await firstStreamAtOrAfter(options.fromTimestamp, lastId);
  const toId = await firstStreamAtOrAfter(options.toTimestamp, lastId);
  const ids = Array.from({ length: Math.max(0, toId - fromId) }, (_, i) => fromId + i);
  const { results, errors } = await PromisePool.withConcurrency(10)
    .for(ids)
    .process(async (id) => {
      await new Promise((r) => setTimeout(r, 40 + Math.random() * 80));
      return getStream(id);
    });
  if (errors.length) throw new Error(`${errors.length}/${ids.length} GetStream calls failed`);

  let volumePlancks = 0n;
  for (const s of results) {
    if (!s || !SUPPORTED_TOKENS.has(s.token.toLowerCase())) continue;
    if (s.startTime >= options.fromTimestamp && s.startTime < options.toTimestamp) {
      volumePlancks += s.deposited;
    }
  }

  // 2. BountyAdapter AI-verified active streaming bounties, Agent Society ACP splits & StonkBase 1x spot collateral in [fromTimestamp, toTimestamp)
  for (const b of bounties) {
    if (!SUPPORTED_TOKENS.has(b.token.toLowerCase())) continue;
    // Only accrue for verified active streaming bounties (`status === Streaming` and `active_stream !== null`)
    if (b.status !== BOUNTY_STATUS_STREAMING || b.activeStream === null) continue;

    // Matches `flow_rate = (bounty.max_flow_rate * score as u128) / 100` in `contracts/adapters/bounty-adapter/src/lib.rs`
    const rawVerifiedFlowRate = (b.maxFlowRate * BigInt(b.minScore)) / SCORE_DENOMINATOR;
    const rawRemainingBudget = b.totalBudget > b.spent ? b.totalBudget - b.spent : 0n;
    if (rawVerifiedFlowRate <= 0n || rawRemainingBudget <= 0n) continue;

    // Normalize 5x leveraged StonkBase synthetic equity flows by STONKBASE_MAX_LEVERAGE (5x) so only 1x unleveraged spot margin collateral is counted
    const isLeveragedDesk = b.title.includes("5X_LEVERAGED");
    const effectiveFlowRate = isLeveragedDesk ? rawVerifiedFlowRate / STONKBASE_MAX_LEVERAGE : rawVerifiedFlowRate;
    const effectiveBudgetCap = isLeveragedDesk ? rawRemainingBudget / STONKBASE_MAX_LEVERAGE : rawRemainingBudget;

    // Compute bounded per-window delta `accruedUntilEnd - accruedBefore` capped at `effectiveBudgetCap` so total accrual across all periods never exceeds the bounty budget
    const elapsedBefore = BigInt(Math.max(0, options.fromTimestamp - b.createdAt));
    const elapsedUntilEnd = BigInt(Math.max(0, options.toTimestamp - b.createdAt));
    const uncappedBefore = elapsedBefore * effectiveFlowRate;
    const uncappedUntilEnd = elapsedUntilEnd * effectiveFlowRate;
    const accruedBefore = uncappedBefore < effectiveBudgetCap ? uncappedBefore : effectiveBudgetCap;
    const accruedUntilEnd = uncappedUntilEnd < effectiveBudgetCap ? uncappedUntilEnd : effectiveBudgetCap;

    if (accruedUntilEnd > accruedBefore) {
      volumePlancks += accruedUntilEnd - accruedBefore;
    }
  }

  if (volumePlancks > 0n) {
    const feesVara = Number((volumePlancks * BigInt(feeBps)) / BPS_DENOMINATOR) / VARA_DECIMALS;
    const volumeVara = Number(volumePlancks) / VARA_DECIMALS;
    dailyFees.addCGToken("vara-network", feesVara, METRIC.SERVICE_FEES);
    dailyRevenue.addCGToken("vara-network", feesVara, METRIC.SERVICE_FEES);
    dailyVolume.addCGToken("vara-network", volumeVara);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
    dailyVolume,
  };
};

const methodology = {
  Fees: "fee_bps (StreamService::GetConfig, currently 250 = 2.5%) applied to StreamCore deposits and bounded per-window settlements across BountyAdapter (including Agent Society ACP splits and StonkBase 1x spot margin flows).",
  UserFees: "Users and autonomous agents pay the 2.5% (250 bps) protocol fee on streamed and settled volume.",
  Revenue: "100% of the 2.5% streaming and settlement fee is routed to the GrowStreams protocol treasury.",
  ProtocolRevenue: "100% of the 2.5% streaming and settlement fee is routed to the GrowStreams protocol treasury.",
  SupplySideRevenue: "No fee share is distributed to external liquidity providers (0%).",
  Volume: "VARA-denominated value deposited and streamed within the window across StreamCore and verified active BountyAdapter streams (including Agent Society ACP splits and StonkBase 1x spot margin collateral, strictly bounded by each bounty's total_budget cap).",
};

export const breakdownMethodology = {
  Fees: {
    [METRIC.SERVICE_FEES]: "Per-window streamed and deposited volume * fee_bps / 10_000 across StreamCore and BountyAdapter.",
  },
  UserFees: {
    [METRIC.SERVICE_FEES]: "2.5% protocol service fee paid by stream creators and trading agents.",
  },
  Revenue: {
    [METRIC.SERVICE_FEES]: "Full 2.5% protocol fee routed to the GrowStreams treasury; 0% supply-side cut.",
  },
  ProtocolRevenue: {
    [METRIC.SERVICE_FEES]: "Full 2.5% protocol fee routed to the GrowStreams treasury; 0% supply-side cut.",
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
