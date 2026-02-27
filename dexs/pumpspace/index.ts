import { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV2LogAdapter } from "../../helpers/uniswap";
import { isCoreAsset } from "../../helpers/prices";
import { Interface } from "ethers";

/**
 * PumpSpace DEX Adapter (Avalanche)
 * - V2: Uniswap V2 fork (factory pair Swap logs)
 * - V3: Trident concentrated liquidity (PoolLogger Swap logs)
 *
 * Pricing for wrapper stables (bUSDC/bAUSD) is handled via defillama-server tokenMapping,
 * so this adapter does NOT include any wrapper-to-underlying remapping.
 */

// --------------------
// Addresses
// --------------------
const V2_FACTORY = "0x26B42c208D8a9d8737A2E5c9C57F4481484d4616";

// PumpSpace Trident V3 mainnet (Avalanche)
const V3_POOL_FACTORY = "0xE749c1cA2EA4f930d1283ad780AdE28625037CeD";
const V3_POOL_LOGGER = "0x77c8dfFE4130FE58e5C3c02a2E7ab6DB7f4F474f";

// PoolLogger: event Swap(address indexed pool, bool zeroForOne, uint256 amountIn, uint256 amountOut)
const V3_SWAP_EVENT =
  "event Swap(address indexed pool, bool zeroForOne, uint256 amountIn, uint256 amountOut)";

const unwrapCallResult = (r: any) => {
  if (r === null || r === undefined) return null;
  if (typeof r === "object" && "output" in r) return (r as any).output;
  return r;
};

const toBigInt = (v: any): bigint => {
  if (v === null || v === undefined) return 0n;
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(v);
  if (typeof v === "string") return BigInt(v);
  return BigInt(v.toString());
};

// Pool address can appear as bytes32-topic-like (0x + 64 hex chars) in some environments.
// Convert to 20-byte address when needed.
const normalizePoolAddress = (raw: any): string | null => {
  if (!raw) return null;
  let s = raw.toString();

  // If bytes32 topic: 0x000...000<20-byte-address> (66 chars including 0x)
  if (s.startsWith("0x") && s.length === 66) s = "0x" + s.slice(26);
  // If no 0x prefix but 40 hex chars
  if (!s.startsWith("0x") && s.length === 40) s = "0x" + s;

  if (s.startsWith("0x") && s.length === 42) return s.toLowerCase();
  return null;
};

// --------------------
// V2 fetch (as-is)
// --------------------
const fetchV2 = getUniV2LogAdapter({
  factory: V2_FACTORY,
  fees: 0.005, // total user fees = 0.5%
  userFeesRatio: 1,
  revenueRatio: 0.5, // 50% of total fees go to protocol (0.25% of volume)
  protocolRevenueRatio: 0.5,
  supplySideRevenueRatio: 0.5,
});

// --------------------
// V3 fetch (PoolLogger-based, Trident CL)
// --------------------
const fetchV3: FetchV2 = async (options: FetchOptions) => {
  const { createBalances, getLogs, api, chain } = options;

  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyProtocolRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();
  const dailyHoldersRevenue = createBalances(); // none

  // defaultProtocolFee() = 2000 bps -> 20% of fees to protocol, 80% to LPs
  let protocolFeeBps = 2000n;
  try {
    const v = await api.call({
      target: V3_POOL_FACTORY,
      abi: "function defaultProtocolFee() view returns (uint256)",
    });
    protocolFeeBps = BigInt(v.toString());
  } catch {
    // keep fallback
  }

  // 10,000 bps = 100%
  const PROTOCOL_FEE_DENOMINATOR = 10_000n;

  // swapFee() is in "pips": 1000 = 0.1% => 1,000,000 = 100%
  const SWAP_FEE_DENOMINATOR = 1_000_000n;

  const fromBlock = await options.getStartBlock();
  const toBlock = await options.getEndBlock();

  const iface = new Interface([V3_SWAP_EVENT]);

  const loadLogs = async (skipIndexer?: boolean) => {
    try {
      return (await getLogs({
        target: V3_POOL_LOGGER,
        eventAbi: V3_SWAP_EVENT,
        fromBlock,
        toBlock,
        entireLog: true,
        cacheInCloud: true,
        ...(skipIndexer ? { skipIndexer: true } : {}),
      })) as any[];
    } catch {
      return [] as any[];
    }
  };

  // Try indexer/cached first, then fallback to RPC if needed
  let logs: any[] = await loadLogs(false);
  if (!logs.length) logs = await loadLogs(true);

  if (!logs.length) {
    return {
      dailyVolume,
      dailyFees,
      dailyUserFees: dailyFees.clone(1),
      dailyRevenue: dailyProtocolRevenue.clone(1),
      dailyProtocolRevenue,
      dailySupplySideRevenue,
      dailyHoldersRevenue,
    };
  }

  type Swap = {
    poolKey: string;
    pool: string;
    zeroForOne: boolean;
    amountIn: bigint;
    amountOut: bigint;
  };

  const swaps: Swap[] = [];
  const poolSet = new Set<string>();

  for (const l of logs) {
    // Parse raw log if possible; fallback to already-parsed fields if present
    let parsedArgs: any = null;
    try {
      if (l?.topics && l?.data) parsedArgs = iface.parseLog(l)?.args ?? null;
    } catch {
      parsedArgs = null;
    }

    const args: any = parsedArgs ?? l?.args ?? l;
    if (!args) continue;

    const poolRaw =
      args.pool ??
      args[0] ??
      l.pool ??
      (l?.topics && l.topics.length > 1 ? l.topics[1] : null);

    const pool = normalizePoolAddress(poolRaw);
    if (!pool) continue;

    const zeroForOne = Boolean(args.zeroForOne ?? args[1] ?? l.zeroForOne);
    const amountIn = toBigInt(args.amountIn ?? args[2] ?? l.amountIn);
    const amountOut = toBigInt(args.amountOut ?? args[3] ?? l.amountOut);

    swaps.push({ pool, poolKey: pool, zeroForOne, amountIn, amountOut });
    poolSet.add(pool);
  }

  const pools = [...poolSet];
  if (!pools.length) {
    return {
      dailyVolume,
      dailyFees,
      dailyUserFees: dailyFees.clone(1),
      dailyRevenue: dailyProtocolRevenue.clone(1),
      dailyProtocolRevenue,
      dailySupplySideRevenue,
      dailyHoldersRevenue,
    };
  }

  // Read pool metadata (IConcentratedLiquidityPool)
  const [token0sRaw, token1sRaw, swapFeesRaw] = await Promise.all([
    api.multiCall({ abi: "address:token0", calls: pools, permitFailure: true }),
    api.multiCall({ abi: "address:token1", calls: pools, permitFailure: true }),
    api.multiCall({
      abi: "function swapFee() view returns (uint24)",
      calls: pools,
      permitFailure: true,
    }),
  ]);

  const meta = new Map<string, { token0: string; token1: string; feePips: bigint }>();
  for (let i = 0; i < pools.length; i++) {
    const token0 = unwrapCallResult(token0sRaw[i]);
    const token1 = unwrapCallResult(token1sRaw[i]);
    const fee = unwrapCallResult(swapFeesRaw[i]);

    if (!token0 || !token1) continue;

    const feePips = fee === null || fee === undefined ? 0n : BigInt(fee.toString());
    meta.set(pools[i], { token0: String(token0), token1: String(token1), feePips });
  }

  // Aggregate balances
  for (const s of swaps) {
    const m = meta.get(s.poolKey);
    if (!m) continue;

    // Per-token exchanged amounts
    // zeroForOne: token0 -> token1
    const amount0 = s.zeroForOne ? s.amountIn : s.amountOut;
    const amount1 = s.zeroForOne ? s.amountOut : s.amountIn;

    // ---- Volume: count on core-asset side (avoid double counting)
    // If token0 is core asset -> use token0 side, else use token1 side (common DefiLlama approach)
    const useToken0 = isCoreAsset(chain, m.token0);
    const volumeToken = useToken0 ? m.token0 : m.token1;
    const volumeAmount = useToken0 ? amount0 : amount1;

    if (volumeAmount > 0n) dailyVolume.add(volumeToken, volumeAmount);

    // ---- Fees: charged on INPUT (amountIn)
    const inputToken = s.zeroForOne ? m.token0 : m.token1;
    const feeAmount = (s.amountIn * m.feePips) / SWAP_FEE_DENOMINATOR;
    if (feeAmount <= 0n) continue;

    dailyFees.add(inputToken, feeAmount);

    // Split fees: protocol vs LPs
    const protocolFeeAmount = (feeAmount * protocolFeeBps) / PROTOCOL_FEE_DENOMINATOR;
    const lpFeeAmount = feeAmount - protocolFeeAmount;

    if (protocolFeeAmount > 0n) dailyProtocolRevenue.add(inputToken, protocolFeeAmount);
    if (lpFeeAmount > 0n) dailySupplySideRevenue.add(inputToken, lpFeeAmount);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees.clone(1),
    dailyRevenue: dailyProtocolRevenue.clone(1),
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
  };
};

// --------------------
// V2 + V3 merge
// --------------------
const fetch: FetchV2 = async (options: FetchOptions) => {
  const [v2, v3] = await Promise.all([fetchV2(options), fetchV3(options)]);

  const outDailyVolume = options.createBalances();
  const outDailyFees = options.createBalances();
  const outDailyUserFees = options.createBalances();
  const outDailyRevenue = options.createBalances();
  const outDailyProtocolRevenue = options.createBalances();
  const outDailySupplySideRevenue = options.createBalances();
  const outDailyHoldersRevenue = options.createBalances();

  const merge = (dst: any, src: any) => {
    if (!src) return;
    if (typeof src === "object" && typeof dst.addBalances === "function") dst.addBalances(src);
  };

  merge(outDailyVolume, v2.dailyVolume);
  merge(outDailyVolume, v3.dailyVolume);

  merge(outDailyFees, v2.dailyFees);
  merge(outDailyFees, v3.dailyFees);

  merge(outDailyUserFees, v2.dailyUserFees);
  merge(outDailyUserFees, v3.dailyUserFees);

  merge(outDailyRevenue, v2.dailyRevenue);
  merge(outDailyRevenue, v3.dailyRevenue);

  merge(outDailyProtocolRevenue, v2.dailyProtocolRevenue);
  merge(outDailyProtocolRevenue, v3.dailyProtocolRevenue);

  merge(outDailySupplySideRevenue, v2.dailySupplySideRevenue);
  merge(outDailySupplySideRevenue, v3.dailySupplySideRevenue);

  merge(outDailyHoldersRevenue, v2.dailyHoldersRevenue);
  merge(outDailyHoldersRevenue, v3.dailyHoldersRevenue);

  return {
    dailyVolume: outDailyVolume,
    dailyFees: outDailyFees,
    dailyUserFees: outDailyUserFees,
    dailyRevenue: outDailyRevenue,
    dailyProtocolRevenue: outDailyProtocolRevenue,
    dailySupplySideRevenue: outDailySupplySideRevenue,
    dailyHoldersRevenue: outDailyHoldersRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.AVAX],
  start: "2024-12-23",
  methodology: {
    Volume:
      "DEX swap volume on PumpSpace (V2 + Trident V3) on Avalanche. " +
      "V2 uses UniswapV2-style pair Swap logs from the V2 factory. " +
      "V3 uses PoolLogger Swap(pool, zeroForOne, amountIn, amountOut) logs and reads token0/token1/swapFee from each CL pool. " +
      "Volume is counted on a single side (core-asset side) to avoid double counting.",
    Fees:
      "V2 charges 0.5% per swap split 50% LP / 50% protocol treasury. " +
      "V3 fees are computed on amountIn using each pool's swapFee() (pips where 1e6 = 100%).",
    UserFees: "Users pay V2 0.5% and V3 swapFee() per swap.",
    Revenue:
      "Protocol-side fees. V2: 50% of total fees. " +
      "V3: protocol share is determined by MiningPoolFactory.defaultProtocolFee() (bps, currently 2000 = 20% of fees).",
    ProtocolRevenue:
      "Treasury share of fees. V2: 50% of fees. V3: defaultProtocolFee() share (currently 20% of fees).",
    SupplySideRevenue:
      "Liquidity providers' share of fees. V2: 50%. V3: remaining share after protocol fee (currently 80% of fees).",
  },
  fetch,
};

export default adapter;