import { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV2LogAdapter } from "../../helpers/uniswap";
import { isCoreAsset } from "../../helpers/prices";
import { Interface } from "ethers";

/**
 * PumpSpace DEX Adapter (Avalanche)
 * - V2: Uniswap V2 fork (factory Pair Swap logs)
 * - V3: Trident concentrated liquidity (PoolLogger Swap logs)
 *
 * Notes:
 * - DefiLlama counts DEX volume on ONE side of a swap (to avoid double counting).
 * - For V3 fees, fee is charged on amountIn (input token).
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

// --------------------
// Stable-like wrapped tokens (PumpSpace)
// (Workaround for missing pricing: map to underlying well-priced stables)
// --------------------
// const bUSDt = "0x3C594084dC7AB1864AC69DFd01AB77E8f65B83B7";
const bUSDC = "0x038Dbe3D967bB8389190446DACdfE7B95b44F73D";
const bAUSD = "0xd211b17Dfe8288D4Fb0dd8EEFF07A6C48fC679D5";

// Underlying stables (Avalanche) - used ONLY for pricing fallback in this adapter
// If your underlying AUSD differs, replace AVAX_AUSD with the correct token address.
// const AVAX_USDT = "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7";
const AVAX_USDC = "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E";
const AVAX_AUSD = "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a";

const STABLE_UNDERLYING_MAP: Record<string, string> = {
  // [bUSDt.toLowerCase()]: AVAX_USDT,
  [bUSDC.toLowerCase()]: AVAX_USDC,
  [bAUSD.toLowerCase()]: AVAX_AUSD,
};

const isStableLike = (token: string) =>
  STABLE_UNDERLYING_MAP[token.toLowerCase()] !== undefined;

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

const pow10 = (exp: number): bigint => 10n ** BigInt(exp);

const scaleAmount = (amount: bigint, fromDecimals: number, toDecimals: number): bigint => {
  if (amount === 0n) return 0n;
  if (fromDecimals === toDecimals) return amount;
  if (fromDecimals > toDecimals) return amount / pow10(fromDecimals - toDecimals);
  return amount * pow10(toDecimals - fromDecimals);
};

const addWithStableMapping = (
  balances: any,
  token: string,
  amount: bigint,
  decimalsMap: Map<string, number>
) => {
  if (!token || amount <= 0n) return;

  const key = token.toLowerCase();
  const mapped = STABLE_UNDERLYING_MAP[key];
  if (!mapped) {
    balances.add(token, amount);
    return;
  }

  const fromDec = decimalsMap.get(key) ?? 18;
  const toDec = decimalsMap.get(mapped.toLowerCase()) ?? 18;
  const adjAmount = scaleAmount(amount, fromDec, toDec);

  if (adjAmount > 0n) balances.add(mapped, adjAmount);
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
  } catch (e) {
    // keep fallback (2000 bps)
    console.warn(
      `[pumpspace/v3] failed to read defaultProtocolFee() from ${V3_POOL_FACTORY}, using fallback 2000 bps`,
      e
    );
  }

  // 10,000 bps = 100%
  const PROTOCOL_FEE_DENOMINATOR = 10_000n;

  // swapFee() is in "pips": 1000 = 0.1% => 1,000,000 = 100%
  const SWAP_FEE_DENOMINATOR = 1_000_000n;

  const fromBlock = await options.getStartBlock();
  const toBlock = await options.getEndBlock();

  const iface = new Interface([V3_SWAP_EVENT]);

  const loadLogs = async (skipIndexer?: boolean) =>
    getLogs({
      target: V3_POOL_LOGGER,
      eventAbi: V3_SWAP_EVENT,
      fromBlock,
      toBlock,
      entireLog: true,
      cacheInCloud: true,
      ...(skipIndexer ? { skipIndexer: true } : {}),
    });

  // 1) Try default (may use indexer/cache)
  // 2) If empty, fallback to direct RPC mode
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

  // Pre-fetch decimals for stable-like tokens (source + underlying)
  const stableTokenList = Array.from(
    new Set([
      ...Object.keys(STABLE_UNDERLYING_MAP),
      ...Object.values(STABLE_UNDERLYING_MAP).map((t) => t.toLowerCase()),
    ])
  );
  const decimalsMap = new Map<string, number>();
  try {
    const decRes = await api.multiCall({
      abi: "uint8:decimals",
      calls: stableTokenList,
      permitFailure: true,
    });
    for (let i = 0; i < stableTokenList.length; i++) {
      const d = unwrapCallResult(decRes[i]);
      if (d === null || d === undefined) continue;
      const n = Number(d.toString());
      if (!Number.isNaN(n)) decimalsMap.set(stableTokenList[i].toLowerCase(), n);
    }
  } catch (e) {
    // non-fatal; we'll default to 18 if missing
    console.warn("[pumpspace/v3] decimals multicall failed (non-fatal)", e);
  }

  // Parse logs & collect pools
  type Swap = {
    pool: string;
    zeroForOne: boolean;
    amountIn: bigint;
    amountOut: bigint;
  };

  const swaps: Swap[] = [];
  const poolSet = new Set<string>();

  for (const l of logs) {
    // If getLogs already returns parsed args, l might contain fields directly.
    // If it returns raw logs, parseLog will decode pool as address.
    const args: any = iface.parseLog(l)?.args ?? l?.args ?? l;
    if (!args) continue;

    const poolRaw = args.pool ?? args[0] ?? l.pool;
    if (!poolRaw) continue;

    // pool may appear as bytes32 topic-like string in some environments → normalize to address
    const poolStr = poolRaw.toString();
    const pool =
      poolStr.length === 42
        ? poolStr
        : poolStr.length === 66
          ? ("0x" + poolStr.slice(26))
          : null;
    if (!pool) continue;

    const zeroForOne = Boolean(args.zeroForOne ?? args[1]);
    const amountIn = toBigInt(args.amountIn ?? args[2]);
    const amountOut = toBigInt(args.amountOut ?? args[3]);

    swaps.push({ pool, zeroForOne, amountIn, amountOut });
    poolSet.add(pool.toLowerCase());
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
  const [token0s, token1s, swapFees] = await Promise.all([
    api.multiCall({
      abi: "address:token0",
      calls: pools,
      permitFailure: true,
    }),
    api.multiCall({
      abi: "address:token1",
      calls: pools,
      permitFailure: true,
    }),
    api.multiCall({
      abi: "function swapFee() view returns (uint24)",
      calls: pools,
      permitFailure: true,
    }),
  ]);

  const meta = new Map<string, { token0: string; token1: string; feePips: bigint }>();
  for (let i = 0; i < pools.length; i++) {
    const token0 = unwrapCallResult(token0s[i]);
    const token1 = unwrapCallResult(token1s[i]);
    const fee = unwrapCallResult(swapFees[i]);

    if (!token0 || !token1) continue;

    const feePips = fee === null || fee === undefined ? 0n : BigInt(fee.toString());
    meta.set(pools[i], { token0, token1, feePips });
  }

  // Aggregate balances
  for (const s of swaps) {
    const m = meta.get(s.pool.toLowerCase());
    if (!m) continue;

    // tokenIn/tokenOut by direction
    const tokenIn = s.zeroForOne ? m.token0 : m.token1;
    const tokenOut = s.zeroForOne ? m.token1 : m.token0;

    // token0/token1 absolute amounts exchanged in this swap
    const amount0 = s.zeroForOne ? s.amountIn : s.amountOut;
    const amount1 = s.zeroForOne ? s.amountOut : s.amountIn;

    // ---- Volume: count on core-asset side to avoid double counting
    // If neither side is core, prefer stable-like side; else fallback to token1
    let baseToken: string;
    let baseAmount: bigint;

    if (isCoreAsset(chain, m.token0)) {
      baseToken = m.token0;
      baseAmount = amount0;
    } else if (isCoreAsset(chain, m.token1)) {
      baseToken = m.token1;
      baseAmount = amount1;
    } else if (isStableLike(m.token0)) {
      baseToken = m.token0;
      baseAmount = amount0;
    } else if (isStableLike(m.token1)) {
      baseToken = m.token1;
      baseAmount = amount1;
    } else {
      baseToken = m.token1;
      baseAmount = amount1;
    }

    addWithStableMapping(dailyVolume, baseToken, baseAmount, decimalsMap);

    // ---- Fees: charged on amountIn (input token)
    if (m.feePips > 0n && s.amountIn > 0n) {
      const feeAmount = (s.amountIn * m.feePips) / SWAP_FEE_DENOMINATOR;
      if (feeAmount > 0n) {
        addWithStableMapping(dailyFees, tokenIn, feeAmount, decimalsMap);

        const protocolFeeAmount = (feeAmount * protocolFeeBps) / PROTOCOL_FEE_DENOMINATOR;
        const lpFeeAmount = feeAmount - protocolFeeAmount;

        if (protocolFeeAmount > 0n)
          addWithStableMapping(dailyProtocolRevenue, tokenIn, protocolFeeAmount, decimalsMap);
        if (lpFeeAmount > 0n)
          addWithStableMapping(dailySupplySideRevenue, tokenIn, lpFeeAmount, decimalsMap);
      }
    }
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
      "V2 uses pair Swap logs from the V2 factory. " +
      "V3 uses PoolLogger Swap(pool, zeroForOne, amountIn, amountOut) logs and reads token0/token1/swapFee from each concentrated liquidity pool. " +
      "Volume is counted on a single side (core-asset side; fallback to stable-like bUSDt/bUSDC/bAUSD) to avoid double counting.",
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