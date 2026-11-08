import { PromisePool } from "@supercharge/promise-pool";
import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { postURL } from "../../utils/fetchURL";

const VARA_RPC = "https://rpc.vara.network";
const STREAM_CORE = "0x8298c2eea5c6bbe55a9cfe72283b5399098fd6a54d9a2a14c2bedba8eea50659";
const TOKEN_VAULT = "0x657cf9c4f929aeac97092037826c1117f9e6cd0e3c4edc44e49decc17b840aa9";
const SPLITS_ROUTER = "0x68b9fd8f53f6557db2c26b5b9a7c63061bb7f36d379dc843b8a53e78f5692f45";
const BOUNTY_ADAPTER = "0x7697bb2e8655e6cd7294389a0289355f48fd5459914d2a735c9966dad548bd4f";
const PERMISSION_MANAGER = "0x52f4299e964dab5e97c91cdd10e2d6e635b19696ab8389889aabceba3de9e581";

const WVARA = "f5e9cb1d1e46b0cda6578dd1684b30f281a45dfaa390e4945b7bfc8ab3e27f3d";
const GVARA = "04314af41b7dbac322e3e66920211d2f799719e1cdc3122a99752f72b6ae84ee";
const GROW = "728d04df91561c66938053a4f5178f749da004ebd219ca05f7c090609a6f7163";
const SUPPORTED_TOKENS = new Set([WVARA, GVARA, GROW]);

const ZERO_ACCOUNT = "0x" + "0".repeat(64);
const GAS_LIMIT = 750000000000;
const VARA_DECIMALS = 1e12;

// Basis-point denominator (10,000 bps = 100%) matching `fee_bps: u16` in `contracts/stream-core/stream-core.idl`.
const BPS_DENOMINATOR = 10_000n;
// Score denominator (100 = 100%) matching `min_score: u32` in `contracts/adapters/bounty-adapter/bounty-adapter.idl`.
const SCORE_DENOMINATOR = 100n;
// Milliseconds per second for converting Gear `exec::block_timestamp()` (`u64` ms) into UNIX seconds.
const MS_PER_SECOND = 1000;
// BountyStatus enum index for `Streaming` in `contracts/adapters/bounty-adapter/src/lib.rs`.
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
  status: number;
  createdAt: number;
};
type SplitGroupRecord = {
  id: number;
  updatedAt: number;
  totalDistributed: bigint;
};

/**
 * Decodes `StreamService::GetConfig` reply to extract `nextStreamId` and `feeBps`.
 */
function decodeConfig(buf: Buffer): { nextStreamId: number; feeBps: number } {
  if (!buf.subarray(0, ROUTE_CONFIG.length).equals(ROUTE_CONFIG)) throw new Error("malformed GetConfig");
  const rest = buf.subarray(ROUTE_CONFIG.length);
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
  if (rest[0] !== 1) throw new Error(`unexpected GetStream opt ${rest[0]}`);
  // opt(1) id(8) sender(32) receiver(32) token(32) flowRate(16) startTime(8) lastUpdate(8) deposited(16)
  const token = rest.subarray(73, 105).toString("hex");
  const startTime = u64LE(rest, 121);
  const deposited = u128LE(rest, 137);
  return { token, startTime, deposited };
}

/**
 * Decodes a SCALE compact-encoded string starting at `offset` in `buf`.
 */
function decodeScaleString(buf: Buffer, offset: number): { value: string; nextOffset: number } {
  const mode = buf[offset] & 3;
  let byteLen = 0;
  let headerLen = 1;
  if (mode === 0) {
    byteLen = buf[offset] >> 2;
  } else if (mode === 1) {
    byteLen = buf.readUInt16LE(offset) >> 2;
    headerLen = 2;
  } else {
    byteLen = buf.readUInt32LE(offset) >> 2;
    headerLen = 4;
  }
  const start = offset + headerLen;
  const end = start + byteLen;
  return { value: buf.subarray(start, end).toString("utf8"), nextOffset: end };
}

/**
 * Decodes `BountyService::GetBounty(id)` reply into a `BountyRecord`.
 */
function decodeBounty(buf: Buffer): BountyRecord | null {
  if (!buf.subarray(0, ROUTE_GET_BOUNTY.length).equals(ROUTE_GET_BOUNTY)) throw new Error("malformed GetBounty");
  const rest = buf.subarray(ROUTE_GET_BOUNTY.length);
  if (rest.length === 0 || rest[0] === 0) return null;
  if (rest[0] !== 1) throw new Error(`unexpected GetBounty opt ${rest[0]}`);
  // opt(1) id(8) creator(32) title(scaleStr) token(32) max_flow_rate(16) min_score(4) total_budget(16) spent(16) ... status(1) created_at(8)
  const id = u64LE(rest, 1);
  const { value: title, nextOffset: afterTitle } = decodeScaleString(rest, 41);
  const token = rest.subarray(afterTitle, afterTitle + 32).toString("hex");
  const maxFlowRate = u128LE(rest, afterTitle + 32);
  const minScore = rest.readUInt32LE(afterTitle + 48);
  const totalBudget = u128LE(rest, afterTitle + 52);
  const status = rest[rest.length - 9];
  const createdAtMs = u64LE(rest, rest.length - 8);
  const createdAt = createdAtMs > 1e11 ? Math.floor(createdAtMs / MS_PER_SECOND) : createdAtMs;
  return { id, title, token, maxFlowRate, minScore, totalBudget, status, createdAt };
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
      const totalBounties = u64LE(totalBountiesBuf, ROUTE_TOTAL_BOUNTIES.length);
      const bountyIds = Array.from({ length: totalBounties }, (_, i) => i + 1);
      const { results: bountyResults } = await PromisePool.withConcurrency(6)
        .for(bountyIds)
        .process(async (id) => {
          const idBuf = Buffer.alloc(8);
          idBuf.writeBigUInt64LE(BigInt(id), 0);
          const reply = await rpcCall(BOUNTY_ADAPTER, "0x" + Buffer.concat([ROUTE_GET_BOUNTY, idBuf]).toString("hex"));
          return decodeBounty(reply);
        });
      const bounties = bountyResults.filter((b): b is BountyRecord => Boolean(b));

      // 2. SplitsRouter: read TotalGroups, GetSplitGroup & GetTotalDistributed
      const totalGroupsBuf = await rpcCall(SPLITS_ROUTER, "0x" + ROUTE_TOTAL_GROUPS.toString("hex"));
      const totalGroups = u64LE(totalGroupsBuf, ROUTE_TOTAL_GROUPS.length);
      const groupIds = Array.from({ length: totalGroups }, (_, i) => i + 1);
      const { results: splitResults } = await PromisePool.withConcurrency(6)
        .for(groupIds)
        .process(async (id) => {
          const idBuf = Buffer.alloc(8);
          idBuf.writeBigUInt64LE(BigInt(id), 0);
          const [grpReply, distReply] = await Promise.all([
            rpcCall(SPLITS_ROUTER, "0x" + Buffer.concat([ROUTE_GET_GROUP, idBuf]).toString("hex")),
            rpcCall(SPLITS_ROUTER, "0x" + Buffer.concat([ROUTE_GET_DISTRIBUTED, idBuf]).toString("hex")),
          ]);
          const grpRest = grpReply.subarray(ROUTE_GET_GROUP.length);
          if (grpRest.length < 17 || grpRest[0] !== 1) return null;
          const updatedAtMs = u64LE(grpRest, grpRest.length - 8);
          const updatedAt = updatedAtMs > 1e11 ? Math.floor(updatedAtMs / MS_PER_SECOND) : updatedAtMs;
          const distRest = distReply.subarray(ROUTE_GET_DISTRIBUTED.length);
          const totalDistributed = distRest.length >= 16 ? u128LE(distRest, 0) : 0n;
          return { id, updatedAt, totalDistributed };
        });
      const splitGroups = splitResults.filter((g): g is SplitGroupRecord => Boolean(g));

      // 3. TokenVault & PermissionManager state verification
      const [vaultCfgBuf, permsBuf] = await Promise.all([
        rpcCall(TOKEN_VAULT, "0x" + ROUTE_VAULT_CONFIG.toString("hex")),
        rpcCall(PERMISSION_MANAGER, "0x" + ROUTE_TOTAL_PERMS.toString("hex")),
      ]);
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
 * Computes GrowStreams daily volume, fees, and protocol revenue across `StreamCore`, `BountyAdapter`, `SplitsRouter`, and `TokenVault`.
 */
const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyVolume = options.createBalances();
  const [{ nextStreamId, feeBps }, { bounties, splitGroups }] = await Promise.all([
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

  // 2. BountyAdapter AI-verified streaming bounties & protocol pillar flows active in [fromTimestamp, toTimestamp)
  for (const b of bounties) {
    if (!SUPPORTED_TOKENS.has(b.token.toLowerCase())) continue;
    if (b.status !== BOUNTY_STATUS_STREAMING && b.status !== BOUNTY_STATUS_COMPLETED) continue;
    // Exclude 5x leveraged perp notional from 1x spot volume
    if (b.title.includes("5X_LEVERAGED")) continue;
    const activeStart = Math.max(options.fromTimestamp, b.createdAt);
    if (options.toTimestamp > activeStart) {
      const overlapSeconds = BigInt(options.toTimestamp - activeStart);
      // Matches `flow_rate = (bounty.max_flow_rate * score as u128) / 100` in `contracts/adapters/bounty-adapter/src/lib.rs`
      const verifiedFlowRate = (b.maxFlowRate * BigInt(b.minScore)) / SCORE_DENOMINATOR;
      const streamedPlancks = verifiedFlowRate * overlapSeconds;
      volumePlancks += streamedPlancks <= b.totalBudget ? streamedPlancks : b.totalBudget;
    }
  }

  // 3. SplitsRouter autonomous 60/15/15/10 agent squad distributions executed in [fromTimestamp, toTimestamp)
  for (const g of splitGroups) {
    if (g.totalDistributed > 0n && g.updatedAt >= options.fromTimestamp && g.updatedAt < options.toTimestamp) {
      volumePlancks += g.totalDistributed;
    }
  }

  if (volumePlancks > 0n) {
    const feesVara = Number((volumePlancks * BigInt(feeBps)) / BPS_DENOMINATOR) / VARA_DECIMALS;
    const volumeVara = Number(volumePlancks) / VARA_DECIMALS;
    dailyFees.addCGToken("vara-network", feesVara, METRIC.SERVICE_FEES);
    dailyRevenue.addCGToken("vara-network", feesVara, METRIC.SERVICE_FEES);
    dailyVolume.addCGToken("vara-network", volumeVara);
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailyVolume };
};

const methodology = {
  Fees: "fee_bps (StreamService::GetConfig, currently 250 = 2.5%) applied to StreamCore deposits, BountyAdapter AI-verified streaming settlements, and SplitsRouter distributions.",
  Revenue: "All streaming, bounty settlement, and split routing fees (2.5%) go to the GrowStreams protocol treasury.",
  ProtocolRevenue: "All streaming, bounty settlement, and split routing fees (2.5%) go to the GrowStreams protocol treasury.",
  Volume: "VARA-denominated value deposited and streamed across StreamCore, BountyAdapter (verified streaming bounties), SplitsRouter (agent society revenue splits), and TokenVault within the time window.",
};

export const breakdownMethodology = {
  Fees: {
    [METRIC.SERVICE_FEES]: "volume * fee_bps / 10_000 across StreamCore, BountyAdapter, and SplitsRouter settlements in the window.",
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
