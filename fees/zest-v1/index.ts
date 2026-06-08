import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { httpGet, httpPost } from "../../utils/fetchURL";
import { sleep } from "../../utils/utils";

const HIRO = "https://api.mainnet.hiro.so";
const PRD_ADDR = "SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N";
const PRD = "pool-reserve-data";
const SENDER = `${PRD_ADDR}.${PRD}`;

const PYTH_URL = "https://hermes.pyth.network/v2/updates/price";
const PYTH_IDS = {
  STX: "0xec7a775f46379b5e943c3526b1c8d54cd49749176b0b98e02dde68d1bd335c17",
  BTC: "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  USDC: "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a",
};
const DIA_ORACLE = "SP1G48FZ4Y7JY8G2Z0N51QTCYGBQ6F4J43J77BQC0.dia-oracle";
const STSTX_RATIO =
  "SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.block-info-nakamoto-ststx-ratio-v2";
const PRICE_PRECISION = 100000000n;
const STSTX_RATIO_DEC = 1000000n;

interface Reserve {
  symbol: string;
  cvHex: string;
  priceKey: string;
}

const RESERVES: Reserve[] = [
  {
    symbol: "stSTX",
    cvHex:
      "0x0616099fb88926d82f30b2f40eaf3ee423cb725bdb3b0b73747374782d746f6b656e",
    priceKey: "stSTX",
  },
  {
    symbol: "wSTX",
    cvHex: "0x061605b65e5089ed1b09b299fe0d910a82e37570781f0477737478",
    priceKey: "STX",
  },
  {
    symbol: "aeUSDC",
    cvHex:
      "0x0616fc2fe628b1da502c1b5eb3d08727ee6022503b5a0c746f6b656e2d616575736463",
    priceKey: "USDC",
  },
  {
    symbol: "sBTC",
    cvHex:
      "0x0614f6decc7cfff2a413bd7cd4f53c25ad7fd1899acc0a736274632d746f6b656e",
    priceKey: "sBTC",
  },
  {
    symbol: "USDh",
    cvHex:
      "0x06162a554e032dff998a8882a98229fd214c54e2516f0d757364682d746f6b656e2d7631",
    priceKey: "USDH",
  },
  {
    symbol: "stSTXbtc",
    cvHex:
      "0x0616099fb88926d82f30b2f40eaf3ee423cb725bdb3b1173747374786274632d746f6b656e2d7632",
    priceKey: "stSTXbtc",
  },
  {
    symbol: "sUSDT",
    cvHex:
      "0x0616bad390278c2d8d61d49bce446eaebd9b8c0314550b746f6b656e2d7375736474",
    priceKey: "USDC",
  },
  {
    symbol: "USDA",
    cvHex:
      "0x0616982f3ec112a5f5928a5c96a914bd733793b896a50a757364612d746f6b656e",
    priceKey: "USDC",
  },
  // DIKO reserve omitted: no on-chain USD price source available
];

// ─── Clarity hex decoder ────────────────────────────────────────────────────

function decodeClarity(hex: string): any {
  const raw = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes: number[] = [];
  for (let i = 0; i < raw.length; i += 2)
    bytes.push(parseInt(raw.slice(i, i + 2), 16));
  let pos = 0;

  function readU32(): number {
    const v =
      (bytes[pos] << 24) |
      (bytes[pos + 1] << 16) |
      (bytes[pos + 2] << 8) |
      bytes[pos + 3];
    pos += 4;
    return v;
  }

  function read(): any {
    const t = bytes[pos++];
    switch (t) {
      case 0x01: {
        let v = 0n;
        for (let i = 0; i < 16; i++) v = (v << 8n) | BigInt(bytes[pos + i]);
        pos += 16;
        return v;
      }
      case 0x03:
        return true;
      case 0x04:
        return false;
      case 0x05: {
        pos++;
        pos += 20;
        return null;
      }
      case 0x06: {
        pos++;
        pos += 20;
        const n = bytes[pos++];
        pos += n;
        return null;
      }
      case 0x07:
        return read();
      case 0x08:
        return read();
      case 0x09:
        return null;
      case 0x0a:
        return read();
      case 0x0b: {
        const c = readU32();
        const a: any[] = [];
        for (let i = 0; i < c; i++) a.push(read());
        return a;
      }
      case 0x0c: {
        const c = readU32();
        const o: Record<string, any> = {};
        for (let i = 0; i < c; i++) {
          const kl = bytes[pos++];
          const k = new TextDecoder().decode(
            new Uint8Array(bytes.slice(pos, pos + kl))
          );
          pos += kl;
          o[k] = read();
        }
        return o;
      }
      case 0x0d: {
        const len = readU32();
        const s = new TextDecoder().decode(
          new Uint8Array(bytes.slice(pos, pos + len))
        );
        pos += len;
        return s;
      }
      default:
        throw new Error(`Unknown clarity 0x${t.toString(16)} @ ${pos - 1}`);
    }
  }

  return read();
}

// ─── On-chain price loading ─────────────────────────────────────────────────

function normalizePyth(price: bigint, expo: number): bigint {
  const adj = expo + 8;
  if (adj === 0) return price;
  if (adj > 0) return price * BigInt(10 ** adj);
  return price / BigInt(10 ** -adj);
}

function encodeStringAscii(s: string): string {
  const b = Array.from(new TextEncoder().encode(s));
  const lenHex = b.length.toString(16).padStart(8, "0");
  const body = b.map((x) => x.toString(16).padStart(2, "0")).join("");
  return "0x0d" + lenHex + body;
}

async function hiroCallRead(
  addr: string,
  contract: string,
  fn: string,
  args: string[] = []
): Promise<any> {
  const url = `${HIRO}/v2/contracts/call-read/${addr}/${contract}/${fn}`;
  const res: any = await withRetry(() => httpPost(url, {
    sender: `${addr}.${contract}`,
    arguments: args,
  })) ;
  if (!res.okay || !res.result)
    throw new Error(`hiro call-read ${fn}: ${res.cause ?? "unknown"}`);
  return decodeClarity(res.result);
}

async function loadPrices(timestamp: number): Promise<Record<string, bigint>> {
  const query = Object.values(PYTH_IDS)
    .map((id) => `ids[]=${id}`)
    .join("&");
  const pythData: any = await withRetry(() =>
    httpGet(`${PYTH_URL}/${timestamp}?${query}`)
  );

  const pyth: Record<string, bigint> = {};
  for (const item of pythData.parsed || []) {
    pyth["0x" + item.id] = normalizePyth(
      BigInt(item.price.price),
      Number(item.price.expo)
    );
  }
  const STX = pyth[PYTH_IDS.STX] ?? 0n;
  const BTC = pyth[PYTH_IDS.BTC] ?? 0n;
  const USDC = pyth[PYTH_IDS.USDC] ?? PRICE_PRECISION;

  let USDH = PRICE_PRECISION;
  try {
    const [a, c] = DIA_ORACLE.split(".");
    const diaResult = await hiroCallRead(a, c, "get-value", [
      encodeStringAscii("USDh/USD"),
    ]);
    if (typeof diaResult === "object" && diaResult !== null) {
      const val = diaResult.value;
      if (typeof val === "bigint") USDH = val;
    }
  } catch (e: any) {
    console.warn(`[zest-v1] DIA oracle USDh failed: ${e.message}`);
  }

  let stStxRatio = STSTX_RATIO_DEC;
  try {
    const [a, c] = STSTX_RATIO.split(".");
    const r = await hiroCallRead(a, c, "get-ststx-ratio-v3", []);
    if (typeof r === "bigint") stStxRatio = r;
  } catch (e: any) {
    console.warn(`[zest-v1] stSTX ratio failed: ${e.message}`);
  }

  return {
    STX,
    sBTC: BTC,
    stSTX: (STX * stStxRatio) / STSTX_RATIO_DEC,
    USDC,
    USDH,
    stSTXbtc: STX,
  };
}

// ─── Reserve state extraction ───────────────────────────────────────────────

function extractTupleUint(hex: string, key: string): bigint | null {
  const raw = hex.startsWith("0x") ? hex.slice(2) : hex;
  const keyBytes = Array.from(new TextEncoder().encode(key));
  const lenByte = keyBytes.length.toString(16).padStart(2, "0");
  const keyHex = keyBytes
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const pattern = lenByte + keyHex + "01";
  const idx = raw.indexOf(pattern);
  if (idx === -1) return null;
  const valStart = idx + pattern.length;
  if (valStart + 32 > raw.length) return null;
  return BigInt("0x" + raw.slice(valStart, valStart + 32));
}

// ─── Block boundary helpers ─────────────────────────────────────────────────

interface BlockInfo {
  height: number;
  indexBlockHash: string;
  blockTime: number;
}

async function getBlock(height: number): Promise<BlockInfo> {
  const b: any = await httpGet(`${HIRO}/extended/v2/blocks/${height}`);
  return {
    height: b.height,
    indexBlockHash: b.index_block_hash,
    blockTime: b.block_time,
  };
}

async function getTip(): Promise<BlockInfo> {
  const d: any = await httpGet(`${HIRO}/extended/v2/blocks?limit=1`);
  const b = d.results[0];
  return {
    height: b.height,
    indexBlockHash: b.index_block_hash,
    blockTime: b.block_time,
  };
}

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 5,
  baseDelay = 5000
): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (i < retries - 1 && (msg.includes("rate") || msg.includes("429"))) {
        await sleep(baseDelay * (i + 1));
      } else {
        throw e;
      }
    }
  }
  throw new Error("unreachable");
}

async function findBlockAtOrAfter(
  targetTs: number,
  lo = 1,
  hi?: number
): Promise<BlockInfo> {
  let upper = hi;
  if (upper == null) {
    const tip = await withRetry(() => getTip());
    if (tip.blockTime < targetTs)
      throw new Error(
        `target ${new Date(targetTs * 1000).toISOString()} is in the future`
      );
    upper = tip.height;
  }
  let lower = lo;
  while (lower < upper) {
    const mid = Math.floor((lower + upper) / 2);
    const b = await withRetry(() => getBlock(mid));
    if (b.blockTime < targetTs) lower = mid + 1;
    else upper = mid;
    await sleep(200);
  }
  return withRetry(() => getBlock(lower));
}

// ─── Reserve snapshot ───────────────────────────────────────────────────────

interface Snapshot {
  accrued: bigint;
  decimals: number;
}

async function readReserve(
  cvHex: string,
  tip: string
): Promise<Snapshot | null> {
  const tipClean = tip.startsWith("0x") ? tip.slice(2) : tip;
  const url = `${HIRO}/v2/contracts/call-read/${PRD_ADDR}/${PRD}/get-reserve-state-read?tip=${tipClean}`;
  const res: any = await withRetry(() =>
    httpPost(url, { sender: SENDER, arguments: [cvHex] })
  );
  if (!res.okay || !res.result) return null;
  const raw: string = res.result;
  if (raw === "0x09" || raw.length < 10) return null;
  const accrued = extractTupleUint(raw, "accrued-to-treasury");
  const decimals = extractTupleUint(raw, "decimals");
  if (accrued == null || decimals == null) return null;
  return { accrued, decimals: Number(decimals) };
}

// Reserve factor: protocol's share of borrower interest, 1e8 fixed-point.
// e.g. 95000000 = 95% to protocol, 5% to suppliers.
const ONE_8 = 100000000n;

async function readReserveFactor(
  cvHex: string,
  tip: string
): Promise<bigint | null> {
  const tipClean = tip.startsWith("0x") ? tip.slice(2) : tip;
  const url = `${HIRO}/v2/contracts/call-read/${PRD_ADDR}/${PRD}/get-reserve-factor-read?tip=${tipClean}`;
  const res: any = await withRetry(() =>
    httpPost(url, { sender: SENDER, arguments: [cvHex] })
  );
  if (!res.okay || !res.result) return null;
  const v = decodeClarity(res.result);
  if (typeof v === "bigint") return v;
  return null;
}

// ─── Fetch ──────────────────────────────────────────────────────────────────

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const prices = await loadPrices(options.endTimestamp);

  const firstBlock = await findBlockAtOrAfter(options.startOfDay);
  const nextDayFirst = await findBlockAtOrAfter(
    options.endTimestamp,
    firstBlock.height
  );
  const lastBlock = await withRetry(() =>
    getBlock(nextDayFirst.height - 1)
  );

  for (const reserve of RESERVES) {
    const [snapStart, snapEnd, factor]: [Snapshot | null, Snapshot | null, bigint | null] = await Promise.all([
      readReserve(reserve.cvHex, firstBlock.indexBlockHash),
      readReserve(reserve.cvHex, lastBlock.indexBlockHash),
      readReserveFactor(reserve.cvHex, lastBlock.indexBlockHash),
    ]);

    if (!snapStart && !snapEnd) continue;

    let delta: bigint;
    let decimals: number;

    if (!snapStart) {
      delta = snapEnd!.accrued;
      decimals = snapEnd!.decimals;
    } else if (!snapEnd) {
      continue;
    } else {
      delta = snapEnd.accrued - snapStart.accrued;
      decimals = snapEnd.decimals;
    }

    if (delta <= BigInt(0)) continue;

    const price = prices[reserve.priceKey] ?? 0n;
    if (price === 0n) continue;

    const scale = BigInt(10 ** decimals);
    const protocolUsd =
      Number((delta * price) / scale) / Number(PRICE_PRECISION);

    // Back out gross interest from the protocol share via the reserve factor:
    //   gross = protocol_share * 1e8 / factor
    // If factor is missing or non-positive, treat the protocol share as the gross
    // (safest: never undercount fees) and emit no supplier-side revenue.
    let grossUsd = protocolUsd;
    let supplierUsd = 0;
    if (factor != null && factor > 0n) {
      const grossDelta = (delta * ONE_8) / factor;
      grossUsd =
        Number((grossDelta * price) / scale) / Number(PRICE_PRECISION);
      supplierUsd = grossUsd - protocolUsd;
    }

    dailyFees.addUSDValue(grossUsd, METRIC.BORROW_INTEREST);
    dailyRevenue.addUSDValue(protocolUsd, 'Borrow interest to protocol');
    dailySupplySideRevenue.addUSDValue(supplierUsd, 'Borrow interest to lenders');
    
    await sleep(500);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees:
    "Gross borrower interest paid across all Zest V1 reserves, derived by inverting the per-reserve reserve-factor against the protocol's accrued-to-treasury delta (gross = protocol_share * 1e8 / reserve_factor). Prices sourced on-chain via Pyth (STX, BTC, USDC), DIA oracle (USDh), and Stacking DAO stSTX ratio contract.",
  Revenue:
    "Protocol's share of borrower interest, computed directly as the daily change in the accrued-to-treasury accumulator per reserve.",
  ProtocolRevenue: "Same as Revenue.",
  SupplySideRevenue:
    "Lenders' share of borrower interest, computed as gross interest minus the protocol's accrued-to-treasury delta.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]: "Gross borrower interest accrued across all reserves.",
  },
  Revenue: {
    'Borrow interest to protocol': "Protocol's share of borrower interest accrued across all reserves.",
  },
  ProtocolRevenue: {
    'Borrow interest to protocol': "Protocol's share of borrower interest accrued across all reserves.",
  },
  SupplySideRevenue: {
    'Borrow interest to lenders': "Lenders' share of borrower interest across all reserves.",
  },
};

const adapter: Adapter = {
  version: 1, // rate limited
  fetch,
  chains: [CHAIN.STACKS],
  start: "2024-02-23",
  methodology,
  breakdownMethodology,
  allowNegativeValue: true,
};

export default adapter;
