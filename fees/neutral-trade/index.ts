import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { getConfig, getCache, setCache } from "../../helpers/cache";
import { getEnv } from "../../helpers/env";
import { httpPost } from "../../utils/fetchURL";
import crypto from "crypto";

const REGISTRY = "https://cdn.jsdelivr.net/gh/neutral-trade/sdk@main/src/registry/vaults.json";
const V1 = "BUNDDh4P5XviMm1f3gCvnq2qKx6TGosAGnoUK12e7cXU";
const V2 = "BUNDeH5A4c47bcEoAjBhN3sCjLgYnRsmt9ibMztqVkC9";
const YEAR = 365 * 24 * 3600;
const U64 = 2 ** 64; // for u128 → number conversion (values stay well below 2^53 after combining)

// --- Base58 ---
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58decode(s: string): Buffer {
  let n = 0n; for (const c of s) n = n * 58n + BigInt(B58.indexOf(c));
  return Buffer.from(n.toString(16).padStart(64, "0"), "hex");
}
function b58encode(b: Buffer): string {
  if (b.every((x) => x === 0)) return "1".repeat(b.length);
  let n = BigInt("0x" + b.toString("hex")), s = "";
  while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const x of b) { if (x === 0) s = "1" + s; else break; }
  return s;
}

// --- ed25519 PDA derivation ---
const FP = 2n ** 255n - 19n;
function modinv(a: bigint, m = FP): bigint {
  let t = 0n, nt = 1n, r = m, nr = ((a % m) + m) % m;
  while (nr) { const q = r / nr; [t, nt] = [nt, t - q * nt]; [r, nr] = [nr, r - q * nr]; }
  return ((t % m) + m) % m;
}
function modpow(b: bigint, e: bigint, m = FP): bigint {
  b = ((b % m) + m) % m; let r = 1n;
  while (e) { if (e & 1n) r = r * b % m; b = b * b % m; e >>= 1n; }
  return r;
}
function isCurvePoint(p: Buffer): boolean {
  const D = (-121665n * modinv(121666n)) % FP;
  const y = p.reduce((a, b, i) => a + BigInt(b) * 256n ** BigInt(i), 0n) & ((1n << 255n) - 1n);
  const y2 = (y * y) % FP;
  const num = (y2 - 1n + FP) % FP;
  const den = ((D * y2 + 1n) % FP + FP) % FP;
  if (den === 0n) return true;
  const x2 = (num * modinv(den)) % FP;
  return modpow(x2, (FP - 1n) / 2n) === 1n;
}
function derivePDA(seeds: Buffer[], prog: Buffer): Buffer {
  const suf = Buffer.from("ProgramDerivedAddress");
  for (let b = 255; b >= 0; b--) {
    const h = crypto.createHash("sha256");
    for (const s of seeds) h.update(s);
    h.update(Buffer.from([b])).update(prog).update(suf);
    const d = h.digest();
    if (!isCurvePoint(d)) return d;
  }
  throw new Error("No valid PDA");
}

// --- Parse Bundle account (Anchor Borsh) ---
function parseBundle(data: Buffer, isV2: boolean) {
  const u128 = (o: number) => Number(data.readBigUInt64LE(o)) + Number(data.readBigUInt64LE(o + 8)) * U64;
  let o = 8 + 32 + 96;
  const vl = data.readUInt32LE(o); o += 4 + vl * 32; // allocatedReceivers vec
  const bal = Number(data.readBigUInt64LE(o)); o += 8 + 8; // bundleUnderlyingBalance + maxDepositAmount
  if (isV2) o += 8;
  o += 8 + 4; // wdDelay + perfFee
  const mgmtBps = data.readUInt32LE(o); o += 4 + 4 + 4; // mgmtBps + depFee + wdFee
  const pfeeShares = u128(o); o += 16 + 4 + 8; // pfeeShares + allocBps + oracleBuf
  if (isV2) o += 16; 
  const shares = u128(o); o += 16 + 8; // totalShares + assetPrecision
  const mint = b58encode(data.subarray(o, o + 32)); // assetAddress
  return { bal, mgmtBps, pfeeShares, shares, mint };
}

// --- Main fetch ---
const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const vaults: any[] = await getConfig("neutral-trade", REGISTRY);
  const bundles = vaults.filter((v: any) => v.type === "Bundle" && v.vaultAddress);

  const addrs: string[] = [];
  for (const v of bundles) {
    const prog = v.bundleProgramId === V2 ? V2 : V1;
    addrs.push(v.vaultAddress, b58encode(derivePDA([Buffer.from("ORACLE"), b58decode(v.vaultAddress)], b58decode(prog))));
  }

  const accounts: any[] = [];
  for (let i = 0; i < addrs.length; i += 100) {
    const resp = await httpPost(getEnv("SOLANA_RPC"), {
      jsonrpc: "2.0", id: 1, method: "getMultipleAccounts",
      params: [addrs.slice(i, i + 100), { encoding: "base64" }],
    });
    if (!resp.result?.value) throw new Error(`RPC failed: ${JSON.stringify(resp.error ?? resp)}`);
    accounts.push(...resp.result.value);
  }

  const timespan = options.toTimestamp - options.fromTimestamp;

  // Both cached values are cumulative, so deltas span missed runs without losing data:
  // managerPfeeShares only ever grows, and price per share carries yield (and losses) forward.
  const cached: Record<string, { pfee: number; pps?: number }> = await getCache("neutral-trade", "pfee-cache");
  const current: Record<string, { pfee: number; pps: number }> = { ...cached } as any;

  for (let i = 0; i < bundles.length; i++) {
    const v = bundles[i];
    const bBuf = accounts[i * 2]?.data?.[0];
    const oBuf = accounts[i * 2 + 1]?.data?.[0];
    if (!bBuf) continue;

    const { bal, mgmtBps, pfeeShares, shares, mint } = parseBundle(Buffer.from(bBuf, "base64"), v.bundleProgramId === V2);
    const equity = oBuf ? Number(Buffer.from(oBuf, "base64").readBigUInt64LE(8)) : 0;
    const aum = bal + equity; // raw units of the deposit token
    if (aum <= 0 || shares <= 0) continue;

    // Management fees: deterministic accrual from AUM × mgmtBps × time
    if (mgmtBps > 0) {
      const mgmtFee = aum * (mgmtBps / 10_000) * (timespan / YEAR);
      dailyFees.add(mint, mgmtFee, METRIC.MANAGEMENT_FEES);
      dailyRevenue.add(mint, mgmtFee, METRIC.MANAGEMENT_FEES);
    }

    const pps = aum / shares;
    const prev = cached[v.vaultAddress];
    current[v.vaultAddress] = { pfee: pfeeShares, pps };
    if (!prev) continue;

    // Performance fees: newly minted manager fee shares valued at current price per share
    if (pfeeShares > prev.pfee) {
      const perfFee = (pfeeShares - prev.pfee) * pps;
      dailyFees.add(mint, perfFee, METRIC.PERFORMANCE_FEES);
      dailyRevenue.add(mint, perfFee, METRIC.PERFORMANCE_FEES);
    }

    // Depositor yield: price-per-share growth × total shares, unclamped so losses
    // count as negative yield
    if (prev.pps && prev.pps > 0) {
      const yieldAmt = (pps - prev.pps) * shares;
      dailyFees.add(mint, yieldAmt, METRIC.ASSETS_YIELDS);
      dailySupplySideRevenue.add(mint, yieldAmt, METRIC.ASSETS_YIELDS);
    }
  }

  await setCache("neutral-trade", "pfee-cache", current);

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: "Total value generated by Neutral Trade vaults: depositor yield from price-per-share growth plus management and performance fees.",
  SupplySideRevenue: "Depositor yield from vault strategy returns, measured as price-per-share growth times total shares between runs.",
  Revenue: "All management and performance fees accrue to the vault managers and protocol.",
  ProtocolRevenue: "All management and performance fees accrue to the vault managers and protocol.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: "Depositor yield from price-per-share growth times total shares, net of fees; negative on losing days.",
    [METRIC.MANAGEMENT_FEES]: "Management fees accrued as annual bps (on-chain mgmtBps) on vault AUM.",
    [METRIC.PERFORMANCE_FEES]: "Performance fees charged by minting vault shares to the manager (managerPfeeShares growth), valued at the current price per share.",
  },
  SupplySideRevenue: {
    [METRIC.ASSETS_YIELDS]: "Depositor yield from vault strategy returns (price-per-share growth times total shares).",
  },
  Revenue: {
    [METRIC.MANAGEMENT_FEES]: "Management fees retained by vault managers and protocol.",
    [METRIC.PERFORMANCE_FEES]: "Performance fees retained by vault managers and protocol.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: { [CHAIN.SOLANA]: { fetch, start: "2024-11-01" } },
  runAtCurrTime: true,
  allowNegativeValue: true, // depositor yield goes negative on losing days
  methodology,
  breakdownMethodology,
};

export default adapter;
