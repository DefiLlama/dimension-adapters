import crypto from "crypto";

const FERMI_PROGRAM_ID =
  process.env.FERMI_DEX_PROGRAM_ID || "FRMiX94PWHbndvySq8xyRx185GvPeggUeKaLmZgVdd4";
const DEFAULT_API = "https://v1.fermi.trade/api/volume";
const DEFAULT_RPC = "https://api.mainnet-beta.solana.com";

type Json = Record<string, any>;

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58(bytes: Buffer): string {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) + BigInt(byte);
  let out = "";
  while (value > 0n) {
    const mod = Number(value % 58n);
    out = BASE58_ALPHABET[mod] + out;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    out = "1" + out;
  }
  return out || "1";
}

function eventDiscriminator(name: string): string {
  return crypto.createHash("sha256").update(`event:${name}`).digest().subarray(0, 8).toString("hex");
}

class Reader {
  offset = 8;
  constructor(readonly data: Buffer) {}

  ensure(size: number) {
    if (this.offset + size > this.data.length) throw new Error("event log is shorter than expected");
  }

  u8(): number {
    this.ensure(1);
    return this.data.readUInt8(this.offset++);
  }

  bool(): boolean {
    return this.u8() !== 0;
  }

  u16(): number {
    this.ensure(2);
    const value = this.data.readUInt16LE(this.offset);
    this.offset += 2;
    return value;
  }

  u64(): string {
    this.ensure(8);
    const value = this.data.readBigUInt64LE(this.offset);
    this.offset += 8;
    return value.toString();
  }

  i64(): string {
    this.ensure(8);
    const value = this.data.readBigInt64LE(this.offset);
    this.offset += 8;
    return value.toString();
  }

  i128(): string {
    this.ensure(16);
    const lo = this.data.readBigUInt64LE(this.offset);
    const hi = this.data.readBigUInt64LE(this.offset + 8);
    this.offset += 16;
    let value = (hi << 64n) + lo;
    if (value & (1n << 127n)) value -= 1n << 128n;
    return value.toString();
  }

  f32(): number {
    this.ensure(4);
    const value = this.data.readFloatLE(this.offset);
    this.offset += 4;
    return value;
  }

  f64(): number {
    this.ensure(8);
    const value = this.data.readDoubleLE(this.offset);
    this.offset += 8;
    return value;
  }

  pubkey(): string {
    this.ensure(32);
    const value = base58(this.data.subarray(this.offset, this.offset + 32));
    this.offset += 32;
    return value;
  }
}

const DECODERS: Record<string, { name: string; decode: (reader: Reader) => Json }> = {
  [eventDiscriminator("FilledPerpOrderLog")]: {
    name: "FilledPerpOrderLog",
    decode: (r) => ({
      mango_group: r.pubkey(),
      perp_market_index: r.u16(),
      seq_num: r.u64(),
    }),
  },
  [eventDiscriminator("PerpTakerTradeLog")]: {
    name: "PerpTakerTradeLog",
    decode: (r) => ({
      mango_group: r.pubkey(),
      mango_account: r.pubkey(),
      perp_market_index: r.u16(),
      taker_side: r.u8(),
      total_base_lots_taken: r.i64(),
      total_base_lots_decremented: r.i64(),
      total_quote_lots_taken: r.i64(),
      total_quote_lots_decremented: r.i64(),
      taker_fees_paid_native_quote: r.i128(),
      fee_penalty_native_quote: r.i128(),
    }),
  },
  [eventDiscriminator("FillLogV3")]: {
    name: "FillLogV3",
    decode: (r) => ({
      mango_group: r.pubkey(),
      market_index: r.u16(),
      taker_side: r.u8(),
      maker_slot: r.u8(),
      maker_out: r.bool(),
      timestamp: r.u64(),
      seq_num: r.u64(),
      maker: r.pubkey(),
      maker_client_order_id: r.u64(),
      maker_fee: r.f32(),
      maker_timestamp: r.u64(),
      taker: r.pubkey(),
      taker_client_order_id: r.u64(),
      taker_fee: r.f32(),
      price_lots: r.i64(),
      quantity_base_lots: r.i64(),
      maker_closed_pnl: r.f64(),
      taker_closed_pnl: r.f64(),
    }),
  },
  [eventDiscriminator("PerpBalanceLog")]: {
    name: "PerpBalanceLog",
    decode: (r) => ({
      mango_group: r.pubkey(),
      mango_account: r.pubkey(),
      market_index: r.u16(),
      base_position: r.i64(),
      quote_position_i80f48: r.i128(),
      long_settled_funding_i80f48: r.i128(),
      short_settled_funding_i80f48: r.i128(),
      long_funding_i80f48: r.i128(),
      short_funding_i80f48: r.i128(),
    }),
  },
};

function parseArgs() {
  const args = new Map<string, string>();
  for (let i = 2; i < process.argv.length; i += 1) {
    const arg = process.argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = process.argv[i + 1];
    if (!next || next.startsWith("--")) {
      args.set(key, "true");
    } else {
      args.set(key, next);
      i += 1;
    }
  }
  return args;
}

async function postRpc(rpcUrl: string, method: string, params: any[]) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await response.json();
  if (!response.ok || json.error) throw new Error(JSON.stringify(json.error || json));
  return json.result;
}

async function sampleTrace(apiUrl: string, start: string, end: string) {
  const url = new URL(apiUrl);
  url.searchParams.set("start_timestamp", start);
  url.searchParams.set("end_timestamp", end);
  url.searchParams.set("trace", "1");
  url.searchParams.set("tx_signature", "required");
  url.searchParams.set("limit", "1");
  const response = await fetch(url);
  const json = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(json));
  const fill = json.fills?.[0];
  if (!fill?.tx_signature) throw new Error("trace response did not include a tx_signature");
  return { url: url.toString(), fill };
}

function decodeProgramData(logMessages: string[]) {
  return logMessages
    .map((line, index) => {
      const match = line.match(/^Program data: ([A-Za-z0-9+/=]+)$/);
      if (!match) return null;
      const data = Buffer.from(match[1], "base64");
      const discriminator = data.subarray(0, 8).toString("hex");
      const decoder = DECODERS[discriminator];
      if (!decoder) {
        return {
          log_index: index,
          event: "Unknown",
          discriminator,
          byte_length: data.length,
          raw_base64: match[1],
        };
      }
      const reader = new Reader(data);
      return {
        log_index: index,
        event: decoder.name,
        discriminator,
        byte_length: data.length,
        decoded: decoder.decode(reader),
      };
    })
    .filter(Boolean);
}

async function main() {
  const args = parseArgs();
  const rpcUrl = args.get("rpc") || process.env.SOLANA_RPC_URL || DEFAULT_RPC;
  const apiUrl = args.get("api") || process.env.FERMI_DEX_VOLUME_API || DEFAULT_API;
  let signature = args.get("signature");
  let traceFill: Json | null = null;
  let traceUrl: string | null = null;

  if (!signature) {
    const start = args.get("start_timestamp");
    const end = args.get("end_timestamp");
    if (!start || !end) {
      throw new Error("pass --signature, or pass --start_timestamp and --end_timestamp to sample a trace row");
    }
    const trace = await sampleTrace(apiUrl, start, end);
    signature = trace.fill.tx_signature;
    traceFill = trace.fill;
    traceUrl = trace.url;
  }

  const [parsedTx, base64Tx] = await Promise.all([
    postRpc(rpcUrl, "getTransaction", [
      signature,
      { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
    ]),
    postRpc(rpcUrl, "getTransaction", [
      signature,
      { encoding: "base64", maxSupportedTransactionVersion: 0 },
    ]),
  ]);

  if (!parsedTx || !base64Tx) throw new Error("transaction not found");
  const txBytes = Buffer.from(base64Tx.transaction[0], "base64");
  const logMessages = parsedTx.meta?.logMessages || [];
  const accountKeys = parsedTx.transaction?.message?.accountKeys || [];

  console.log(JSON.stringify({
    trace_url: traceUrl,
    trace_fill: traceFill,
    signature,
    slot: parsedTx.slot,
    block_time: parsedTx.blockTime,
    transaction_size_bytes: txBytes.length,
    status_ok: parsedTx.meta?.err === null,
    error: parsedTx.meta?.err,
    fee_lamports: parsedTx.meta?.fee,
    compute_units_consumed: parsedTx.meta?.computeUnitsConsumed,
    fermi_program_invoked: logMessages.some((line: string) => line.includes(`Program ${FERMI_PROGRAM_ID} invoke`)),
    fermi_program_id: FERMI_PROGRAM_ID,
    fermi_account_keys: accountKeys
      .map((key: any, index: number) => ({ index, pubkey: key.pubkey || key.toString?.() || key }))
      .filter((key: any) => key.pubkey === FERMI_PROGRAM_ID),
    decoded_program_data_logs: decodeProgramData(logMessages),
    matching_log_messages: logMessages.filter((line: string) =>
      line.includes(FERMI_PROGRAM_ID) ||
      line.includes("ExecutionQueueV5") ||
      line.startsWith("Program data: "),
    ),
  }, null, 2));
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
