import { PromisePool } from "@supercharge/promise-pool";
import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { postURL } from "../../utils/fetchURL";

const VARA_RPC = "https://rpc.vara.network";
const STREAM_CORE = "0x8298c2eea5c6bbe55a9cfe72283b5399098fd6a54d9a2a14c2bedba8eea50659";
const WVARA = "f5e9cb1d1e46b0cda6578dd1684b30f281a45dfaa390e4945b7bfc8ab3e27f3d";
const ZERO_ACCOUNT = "0x" + "0".repeat(64);
const GAS_LIMIT = 750000000000;
const VARA_DECIMALS = 1e12;

function scaleString(value: string): Buffer {
  const bytes = Buffer.from(value, "utf8");
  return Buffer.concat([Buffer.from([bytes.length << 2]), bytes]);
}
function route(service: string, method: string): Buffer {
  return Buffer.concat([scaleString(service), scaleString(method)]);
}

const ROUTE_CONFIG = route("StreamService", "GetConfig");
const ROUTE_GETSTREAM = route("StreamService", "GetStream");

function u64LE(buf: Buffer, offset = 0) {
  return Number(buf.readBigUInt64LE(offset));
}

async function rpcCall(program: string, payloadHex: string): Promise<Buffer> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res: any = await postURL(
        VARA_RPC,
        { jsonrpc: "2.0", id: 1, method: "gear_calculateReplyForHandle", params: [ZERO_ACCOUNT, program, payloadHex, GAS_LIMIT, 0] },
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

type Stream = { startTime: number; deposited: bigint };

function decodeConfig(buf: Buffer): { nextStreamId: number; feeBps: number } {
  if (!buf.subarray(0, ROUTE_CONFIG.length).equals(ROUTE_CONFIG)) throw new Error("malformed GetConfig");
  const rest = buf.subarray(ROUTE_CONFIG.length);
  // admin(32) minBuffer(8) nextStreamId(8) tokenVault(32) superTokenCount(4) feeBps(2)
  return { nextStreamId: u64LE(rest, 40), feeBps: rest.readUInt16LE(84) };
}

function decodeStream(buf: Buffer): { token: string; startTime: number; deposited: bigint } | null {
  if (!buf.subarray(0, ROUTE_GETSTREAM.length).equals(ROUTE_GETSTREAM)) throw new Error("malformed GetStream");
  const rest = buf.subarray(ROUTE_GETSTREAM.length);
  if (rest.length === 0 || rest[0] === 0) return null;
  if (rest[0] !== 1) throw new Error(`unexpected GetStream opt ${rest[0]}`);
  // opt(1) id(8) sender(32) receiver(32) token(32) flowRate(16) startTime(8) lastUpdate(8) deposited(16)
  const token = rest.subarray(73, 105).toString("hex");
  const startTime = u64LE(rest, 121);
  const deposited = rest.readBigUInt64LE(137) + (rest.readBigUInt64LE(145) << 64n);
  return { token, startTime, deposited };
}

let cached: Promise<{ feeBps: number; streams: Stream[] }> | undefined;
function getSnapshot() {
  if (!cached) {
    cached = (async () => {
      const { nextStreamId, feeBps } = decodeConfig(await rpcCall(STREAM_CORE, "0x" + ROUTE_CONFIG.toString("hex")));
      const ids = Array.from({ length: Math.max(0, nextStreamId - 1) }, (_, i) => i + 1);
      const { results, errors } = await PromisePool.withConcurrency(10).for(ids).process(async (id) => {
        await new Promise((r) => setTimeout(r, 40 + Math.random() * 80));
        const idBuf = Buffer.alloc(8);
        idBuf.writeBigUInt64LE(BigInt(id), 0);
        return decodeStream(await rpcCall(STREAM_CORE, "0x" + Buffer.concat([ROUTE_GETSTREAM, idBuf]).toString("hex")));
      });
      if (errors.length) throw new Error(`${errors.length}/${ids.length} GetStream calls failed`);
      const streams = (results as Awaited<ReturnType<typeof decodeStream>>[])
        .filter((s): s is NonNullable<typeof s> => !!s && s.token.toLowerCase() === WVARA)
        .map(({ startTime, deposited }) => ({ startTime, deposited }));
      return { feeBps, streams };
    })().catch((e) => {
      cached = undefined;
      throw e;
    });
  }
  return cached;
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyVolume = options.createBalances();
  const { feeBps, streams } = await getSnapshot();

  let volumePlancks = 0n;
  for (const s of streams) {
    if (s.startTime >= options.fromTimestamp && s.startTime < options.toTimestamp) volumePlancks += s.deposited;
  }
  if (volumePlancks > 0n) {
    const feesVara = Number((volumePlancks * BigInt(feeBps)) / 10000n) / VARA_DECIMALS;
    const volumeVara = Number(volumePlancks) / VARA_DECIMALS;
    dailyFees.addCGToken("vara-network", feesVara, METRIC.SERVICE_FEES);
    dailyRevenue.addCGToken("vara-network", feesVara, METRIC.SERVICE_FEES);
    dailyVolume.addCGToken("vara-network", volumeVara);
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailyVolume };
};

const methodology = {
  Fees: "fee_bps (StreamService::GetConfig, currently 250 = 2.5%) on each new wVARA stream's deposited amount. Counted on the stream's start_time, so days with no new streams are 0.",
  Revenue: "All streaming fees (currently 2.5%) go to the protocol treasury.",
  ProtocolRevenue: "All streaming fees (currently 2.5%) go to the protocol treasury.",
  Volume: "wVARA deposited into streams whose start_time falls in the window.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SERVICE_FEES]: "deposited * fee_bps / 10_000 for wVARA streams created in the window.",
  },
  Revenue: {
    [METRIC.SERVICE_FEES]: "Full fee to GrowStreams treasury; no supply-side cut.",
  },
  ProtocolRevenue: {
    [METRIC.SERVICE_FEES]: "Full fee to GrowStreams treasury; no supply-side cut.",
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
