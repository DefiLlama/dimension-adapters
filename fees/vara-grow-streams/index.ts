import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { postURL } from "../../utils/fetchURL";

const VARA_RPC = "https://rpc.vara.network";
const STREAM_CORE = "0x8298c2eea5c6bbe55a9cfe72283b5399098fd6a54d9a2a14c2bedba8eea50659";
const WVARA = "0xf5e9cb1d1e46b0cda6578dd1684b30f281a45dfaa390e4945b7bfc8ab3e27f3d";
const WVARA_HEX = WVARA.slice(2).toLowerCase();
const ZERO_ACCOUNT = "0x" + "0".repeat(64);
const GAS_LIMIT = 750000000000;
const VARA_DECIMALS = 1e12;

const STREAMING_FEES = "Streaming Fees";
const STREAMING_FEES_TO_TREASURY = "Streaming Fees To Treasury";
const STREAMING_VOLUME = "Streaming Volume";

function scaleString(value: string): Buffer {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length >= 64) throw new Error("vara-grow-streams: route segment too long");
  return Buffer.concat([Buffer.from([bytes.length << 2]), bytes]);
}
function route(service: string, method: string): Buffer {
  return Buffer.concat([scaleString(service), scaleString(method)]);
}

const ROUTE_TOTAL = route("StreamService", "TotalStreams");
const ROUTE_ACTIVE = route("StreamService", "ActiveStreams");
const ROUTE_CONFIG = route("StreamService", "GetConfig");
const ROUTE_GETSTREAM = route("StreamService", "GetStream");

function u64LE(buf: Buffer, offset = 0): number {
  return Number(buf.readBigUInt64LE(offset));
}
function u128LE(buf: Buffer, offset = 0): bigint {
  const lo = buf.readBigUInt64LE(offset);
  const hi = buf.readBigUInt64LE(offset + 8);
  return lo + (hi << 64n);
}

type Config = {
  admin: string;
  minBufferSeconds: number;
  nextStreamId: number;
  tokenVault: string;
  superTokenCount: number;
  feeBps: number;
  treasury: string;
};

type Stream = {
  id: number;
  sender: string;
  receiver: string;
  token: string; // hex without 0x
  flowRate: bigint;
  startTime: number;
  lastUpdate: number;
  deposited: bigint;
  withdrawn: bigint;
  streamed: bigint;
  status: number; // 0 Active, 1 Paused, 2 Stopped
};

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function rpcCall(program: string, payloadHex: string): Promise<Buffer> {
  let lastErr: any;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res: any = await postURL(
        VARA_RPC,
        { jsonrpc: "2.0", id: 1, method: "gear_calculateReplyForHandle", params: [ZERO_ACCOUNT, program, payloadHex, GAS_LIMIT, 0] },
        1
      );
      if (res.error) throw new Error(`gear_calculateReplyForHandle failed: ${JSON.stringify(res.error)}`);
      const result = res.result;
      if (!result || !result.payload || result.payload === "0x" || !result.code?.Success) {
        throw new Error(`failed reply from ${program}: ${JSON.stringify(result?.code)} payload=${result?.payload}`);
      }
      return Buffer.from(result.payload.slice(2), "hex");
    } catch (e: any) {
      lastErr = e;
      const msg = String(e?.message ?? e);
      const is429 = msg.includes("429") || String(e?.axiosError ?? "").includes("429") || msg.includes("Too Many Requests");
      if (is429 && attempt < 5) {
        const backoff = 400 * Math.pow(2, attempt) + Math.random() * 200;
        await sleep(backoff);
        continue;
      }
      if (attempt < 2) {
        await sleep(200 * (attempt + 1));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

function decodeTotalStreams(buf: Buffer): number {
  if (!buf.subarray(0, ROUTE_TOTAL.length).equals(ROUTE_TOTAL)) throw new Error("vara-grow-streams: malformed TotalStreams reply");
  const rest = buf.subarray(ROUTE_TOTAL.length);
  if (rest.length < 8) throw new Error("vara-grow-streams: TotalStreams reply too short");
  return u64LE(rest, 0);
}
function decodeActiveStreams(buf: Buffer): number {
  if (!buf.subarray(0, ROUTE_ACTIVE.length).equals(ROUTE_ACTIVE)) throw new Error("vara-grow-streams: malformed ActiveStreams reply");
  const rest = buf.subarray(ROUTE_ACTIVE.length);
  if (rest.length < 8) throw new Error("vara-grow-streams: ActiveStreams reply too short");
  return u64LE(rest, 0);
}
function decodeConfig(buf: Buffer): Config {
  if (!buf.subarray(0, ROUTE_CONFIG.length).equals(ROUTE_CONFIG)) throw new Error("vara-grow-streams: malformed GetConfig reply");
  const rest = buf.subarray(ROUTE_CONFIG.length);
  let off = 0;
  const admin = "0x" + rest.subarray(off, off + 32).toString("hex"); off += 32;
  const minBufferSeconds = u64LE(rest, off); off += 8;
  const nextStreamId = u64LE(rest, off); off += 8;
  const tokenVault = "0x" + rest.subarray(off, off + 32).toString("hex"); off += 32;
  const superTokenCount = rest.readUInt32LE(off); off += 4;
  const feeBps = rest.readUInt16LE(off); off += 2;
  const treasury = "0x" + rest.subarray(off, off + 32).toString("hex"); off += 32;
  return { admin, minBufferSeconds, nextStreamId, tokenVault, superTokenCount, feeBps, treasury };
}
function decodeStream(buf: Buffer): Stream | null {
  if (!buf.subarray(0, ROUTE_GETSTREAM.length).equals(ROUTE_GETSTREAM)) throw new Error("vara-grow-streams: malformed GetStream reply");
  const rest = buf.subarray(ROUTE_GETSTREAM.length);
  if (rest.length === 0) return null;
  const opt = rest[0];
  if (opt === 0) return null;
  if (opt !== 1) throw new Error(`vara-grow-streams: unexpected GetStream opt ${opt}`);
  let off = 1;
  const id = u64LE(rest, off); off += 8;
  const sender = rest.subarray(off, off + 32).toString("hex"); off += 32;
  const receiver = rest.subarray(off, off + 32).toString("hex"); off += 32;
  const token = rest.subarray(off, off + 32).toString("hex"); off += 32;
  const flowRate = u128LE(rest, off); off += 16;
  const startTime = u64LE(rest, off); off += 8;
  const lastUpdate = u64LE(rest, off); off += 8;
  const deposited = u128LE(rest, off); off += 16;
  const withdrawn = u128LE(rest, off); off += 16;
  const streamed = u128LE(rest, off); off += 16;
  const status = rest[off];
  return { id, sender, receiver, token, flowRate, startTime, lastUpdate, deposited, withdrawn, streamed, status };
}

type Snapshot = {
  totalStreams: number;
  activeStreams: number;
  config: Config;
  wvaraStreams: Stream[];
  // stats for logging / methodology
  statusCounts: Record<string, number>;
  totalDepositedAll: bigint;
  totalStreamedAll: bigint;
};

let cachedSnapshot: Promise<Snapshot> | undefined;
function getSnapshot(): Promise<Snapshot> {
  if (!cachedSnapshot) {
    cachedSnapshot = (async (): Promise<Snapshot> => {
      const totalBufP = rpcCall(STREAM_CORE, "0x" + ROUTE_TOTAL.toString("hex"));
      const activeBufP = rpcCall(STREAM_CORE, "0x" + ROUTE_ACTIVE.toString("hex"));
      const configBufP = rpcCall(STREAM_CORE, "0x" + ROUTE_CONFIG.toString("hex"));
      const [totalBuf, activeBuf, configBuf] = await Promise.all([totalBufP, activeBufP, configBufP]);
      const totalStreams = decodeTotalStreams(totalBuf);
      const activeStreams = decodeActiveStreams(activeBuf);
      const config = decodeConfig(configBuf);

      // fetch all streams in parallel with limited concurrency
      // Stream ids are dense from 1 .. nextStreamId-1; TotalStreams may be slightly lower than that if some ids were never used
      const upper = Math.max(totalStreams, config.nextStreamId - 1);
      const ids = Array.from({ length: upper }, (_, i) => i + 1); // ids start at 1; 0 is None
      const allStreams: Stream[] = [];

      // filter out gaps where GetStream returns None (id 0 or deleted)
      // Chunked fetching to respect Vara RPC rate limits (429)
      const CHUNK_SIZE = 10;
      const allResults: (Stream | null)[] = [];
      let chunkErrors = 0;
      for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
        const chunk = ids.slice(i, i + CHUNK_SIZE);
        const resultsChunk = await Promise.all(
          chunk.map(async (id) => {
            const idBuf = Buffer.alloc(8);
            idBuf.writeBigUInt64LE(BigInt(id), 0);
            const p = "0x" + Buffer.concat([ROUTE_GETSTREAM, idBuf]).toString("hex");
            try {
              const buf = await rpcCall(STREAM_CORE, p);
              return decodeStream(buf);
            } catch (e) {
              chunkErrors++;
              console.warn(`vara-grow-streams: GetStream ${id} failed: ${(e as any)?.message ?? e}`);
              return null;
            }
          })
        );
        allResults.push(...resultsChunk);
        if (i + CHUNK_SIZE < ids.length) await sleep(120);
      }
      const results = allResults;
      const errors: any[] = chunkErrors ? [{ message: `${chunkErrors} GetStream calls failed in chunks` }] : [];

      if (errors.length > 0) {
        // log but don't hard fail unless all failed
        console.warn(`vara-grow-streams: ${errors.length}/${ids.length} GetStream calls failed`, (errors[0] as any)?.message ?? errors[0]);
      }
      for (const s of results as (Stream | null)[]) if (s) allStreams.push(s);

      const wvaraStreams = allStreams.filter((s) => s.token.toLowerCase() === WVARA_HEX);
      const statusCounts: Record<string, number> = { Active: 0, Paused: 0, Stopped: 0, Other: 0 };
      let totalDepositedAll = 0n;
      let totalStreamedAll = 0n;
      for (const s of wvaraStreams) {
        totalDepositedAll += s.deposited;
        totalStreamedAll += s.streamed;
        if (s.status === 0) statusCounts.Active++;
        else if (s.status === 1) statusCounts.Paused++;
        else if (s.status === 2) statusCounts.Stopped++;
        else statusCounts.Other++;
      }

      console.info(
        `vara-grow-streams snapshot: totalStreams=${totalStreams} activeStreams=${activeStreams} wvaraStreams=${wvaraStreams.length} feeBps=${config.feeBps} statusCounts=${JSON.stringify(statusCounts)} totalDeposited=${Number(totalDepositedAll) / VARA_DECIMALS} VARA`
      );

      return { totalStreams, activeStreams, config, wvaraStreams, statusCounts, totalDepositedAll, totalStreamedAll };
    })().catch((e) => {
      // invalidate cache on failure so next call retries
      cachedSnapshot = undefined;
      throw e;
    });
  }
  return cachedSnapshot;
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyVolume = options.createBalances();

  const snap = await getSnapshot();
  const { wvaraStreams, config } = snap;
  const feeBps = config.feeBps; // e.g. 250 = 2.5%

  const from = options.fromTimestamp;
  const to = options.toTimestamp;

  let volumePlancks = 0n;
  for (const s of wvaraStreams) {
    if (s.startTime >= from && s.startTime < to) {
      volumePlancks += s.deposited;
    }
  }

  if (volumePlancks > 0n) {
    const feesPlancks = (volumePlancks * BigInt(feeBps)) / 10000n;
    const volumeVara = Number(volumePlancks) / VARA_DECIMALS;
    const feesVara = Number(feesPlancks) / VARA_DECIMALS;

    dailyFees.addCGToken("vara-network", feesVara, STREAMING_FEES);
    dailyRevenue.addCGToken("vara-network", feesVara, STREAMING_FEES_TO_TREASURY);
    dailyVolume.addCGToken("vara-network", volumeVara, STREAMING_VOLUME);
  }

  // Log per-day diagnostics (useful for backfills)
  // Includes current global stats so dashboards can reference them in methodology
  if (options.startOfDay % 86400 === 0) {
    // only log once per day invocation to avoid spam in hourly mode
    console.info(
      `vara-grow-streams day ${options.dateString}: volumePlancks=${volumePlancks} feesBps=${feeBps} totalStreams=${snap.totalStreams} activeStreams=${snap.activeStreams} wvaraDepositedTotal=${Number(snap.totalDepositedAll) / VARA_DECIMALS}`
    );
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailyVolume,
  };
};

const methodology = {
  Fees: "2.5% streaming fee (fee_bps from StreamService::GetConfig) applied to every new wVARA stream's initial_deposit (Stream.deposited where token == wVARA 0xf5e9cb1d1e46b0cda6578dd1684b30f281a45dfaa390e4945b7bfc8ab3e27f3d). Daily fees = sum(deposited in day) * fee_bps / 10_000. Historical total streamed = sum of all wVARA deposited across all streams (current TotalStreams).",
  Revenue: "All streaming fees are retained by the protocol treasury (no supply-side share). Daily revenue == daily fees.",
  ProtocolRevenue: "100% of streaming fees to treasury (config.treasury).",
  Volume: "Total wVARA deposited into streams whose start_time falls in the day — approximates money routed through the streaming protocol that day. Cumulative sum equals historical money streamed.",
};

const breakdownMethodology = {
  Fees: {
    [STREAMING_FEES]: "wVARA streaming fee = deposited * fee_bps / 10_000 for streams created that day (token == wVARA; gVARA super-token underlies wVARA for streaming).",
  },
  Revenue: {
    [STREAMING_FEES_TO_TREASURY]: "Full fee to GrowStreams treasury; no LP or staker cut.",
  },
  ProtocolRevenue: {
    [STREAMING_FEES_TO_TREASURY]: "Swept to treasury via SuperTokenService::CollectFee.",
  },
  Volume: {
    [STREAMING_VOLUME]: "Sum of Stream.deposited for wVARA streams created that day.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  chains: [CHAIN.VARA],
  start: "2026-06-21",
  fetch,
  methodology,
  breakdownMethodology,
};

export default adapter;
