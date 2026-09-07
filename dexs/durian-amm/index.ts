/**
 * Durian AMM — post-graduation DEX adapter.
 *
 * PR target: https://github.com/DefiLlama/dimension-adapters
 * Final path: `dexs/durian-amm/index.ts`
 *
 * ── Protocol ───────────────────────────────────────────────────────
 *
 * When a Durianfun bonding-curve market hits its graduation
 * threshold, the BondingCurveMarket (BCM) contract migrates its
 * reserves into a dedicated liquidity pool. Two pool shapes exist:
 *
 *   1. `DurianAMM` (V4.5 / V4.6.6 / V4.6.7) — a single-pair
 *      constant-product AMM that quotes one launchpad token against
 *      native KUB. Each market graduates into its own dedicated AMM
 *      contract; there is no shared factory and no LP token registry.
 *
 *   2. `DurianV3FactoryV5` (V5 only) — a Uniswap-V3 fork used as the
 *      FALLBACK graduation venue when seeding the external KUBLERX V3
 *      pool reverts. The position is minted into a bounded range
 *      against KKUB. Pools come from a real factory, so they are
 *      discovered via `PoolCreated` rather than per-market events.
 *
 * The three DurianAMM generations emit byte-for-byte identical
 * `Swapped` event ABIs (verified: same topic-0), so a single sweep
 * covers all of them. Only the DISCOVERY path differs — V4.6.7
 * appends `uint8 graduationTarget` to `TokenCreated` and `uint8 target`
 * to `Graduated`, changing both event hashes, so it needs its own ABIs.
 *
 * ── Event ABIs ─────────────────────────────────────────────────────
 *
 *   BCM.Graduated(                                    ← V4.5 / V4.6.6
 *       address indexed market,
 *       address indexed token,
 *       address indexed ammPool,
 *       uint256 kubRaised,
 *       uint256 treasuryFee,
 *       uint256 creatorReward)
 *
 *   BCM.Graduated(…, uint8 target)                    ← V4.6.7 (+V5)
 *
 *   AMM.Swapped(                     ← identical V4.5 / V4.6.6 / V4.6.7
 *       address indexed trader,
 *       bool    indexed kubForToken,
 *       uint256 amountIn,         ← gross if kubForToken (KUB in)
 *       uint256 amountOut,        ← net  if !kubForToken (KUB out, post-fee)
 *       uint256 fee,              ← treasury + LP share, in KUB
 *       uint256 newReserveKub,
 *       uint256 newReserveToken)
 *
 *   Factory.TokenCreated(                             ← V4.5 / V4.6.6
 *       address indexed token,
 *       address indexed market,
 *       address indexed creator,
 *       string name, string symbol,
 *       uint256 totalSupply, uint256 timestamp)
 *
 *   Factory.TokenCreated(…, uint8 graduationTarget)   ← V4.6.7
 *
 *   DurianV3Factory.PoolCreated(                      ← V5 fallback venue
 *       address indexed token0,
 *       address indexed token1,
 *       uint24  indexed fee,
 *       int24 tickSpacing,
 *       address pool)
 *
 *   DurianV3Pool.Swap(…)          ← standard Uniswap-V3 swap event
 *
 * ── Volume / Fees methodology ──────────────────────────────────────
 *
 *   DurianAMM (constant product):
 *     kubForToken == true   (user buys token with KUB):
 *         volumeKub = amountIn          (already gross)
 *     kubForToken == false  (user sells token for KUB):
 *         volumeKub = amountOut + fee   (re-add fee to get gross)
 *     Fees are split between the project treasury (~0.3 %) and the LP
 *     share (~0.7 %).
 *
 *   Durian V3:
 *     volumeKub = |KKUB-side amount| of each Swap
 *     fee       = volumeKub × poolFeeTier / 1e6 (graduation always
 *                 seeds the 0.30 % tier). Uniswap-V3 charges the fee on
 *                 the input token; pricing it on the KKUB-side notional
 *                 is the standard DefiLlama approximation. No protocol
 *                 fee is enabled on these pools, so the whole swap fee
 *                 accrues to liquidity providers.
 *
 * ── Discovery ──────────────────────────────────────────────────────
 *
 * DurianAMM pools are *not* tracked by any registry. We discover them by:
 *   1. Listing every BCM market spawned by each factory
 *      (TokenCreated since each factory's deploy block).
 *   2. Reading the `Graduated` event from each market — its 3rd
 *      indexed param is the AMM pool address.
 *
 * Durian V3 pools come straight from the factory's `PoolCreated`.
 *
 * This is done historically (since genesis) on every fetch call,
 * so newly-graduated pools are picked up automatically. Per-day
 * `Swapped` / `Swap` logs are fetched in the daily window via `getLogs`.
 */

import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const FACTORY_V45  = "0xdf4f3dB298A9aDe853191F58b4b2a322D47EC005";
const FACTORY_V466 = "0x89b6b73BD18dbEA0e2218c25c1963fd5FBaB3c87";
const FACTORY_V467 = "0x0480017E51dC813a0fad8aA73EAb2f8476ac0e8F";

// V5's fallback graduation venue — a Uniswap-V3 fork whose `createPool` is
// whitelisted to the graduation seeder. (V5's default target is the external
// KUBLERX V3 factory, whose volume belongs to KUBLERX's own adapter, not this
// one.) Deployed 2026-08-12.
const DURIAN_V3_FACTORY = "0xC010FbB2377e6C833F7b3eD91edc3794C97D3D0A";
const DURIAN_V3_FACTORY_BLOCK = 34_014_863;

// KKUB (wrapped KUB) — used to price native-KUB notionals in USD via
// DefiLlama's Bitkub Chain oracle, and the quote asset of every Durian V3 pool.
const KKUB = "0x67eBD850304c70d983B2d1b93ea79c7CD6c3F6b5";

const TOKEN_CREATED_ABI =
  "event TokenCreated(address indexed token, address indexed market, address indexed creator, string name, string symbol, uint256 totalSupply, uint256 timestamp)";

// V4.6.7 appends `uint8 graduationTarget` → distinct event hash.
const TOKEN_CREATED_ABI_V467 =
  "event TokenCreated(address indexed token, address indexed market, address indexed creator, string name, string symbol, uint256 totalSupply, uint256 timestamp, uint8 graduationTarget)";

const GRADUATED_ABI =
  "event Graduated(address indexed market, address indexed token, address indexed ammPool, uint256 kubRaised, uint256 treasuryFee, uint256 creatorReward)";

// V4.6.7 appends `uint8 target` → distinct event hash; the 6-arg ABI above
// matches zero V4.6.7 graduations.
const GRADUATED_ABI_V467 =
  "event Graduated(address indexed market, address indexed token, address indexed ammPool, uint256 kubRaised, uint256 treasuryFee, uint256 creatorReward, uint8 target)";

const SWAPPED_ABI =
  "event Swapped(address indexed trader, bool indexed kubForToken, uint256 amountIn, uint256 amountOut, uint256 fee, uint256 newReserveKub, uint256 newReserveToken)";

const POOL_CREATED_ABI =
  "event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)";

const V3_SWAP_ABI =
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)";

const ZERO = "0x0000000000000000000000000000000000000000";

// BondingCurveMarket graduation targets (V4.6.7+): 0 = in-house DurianAMM,
// 1 = external KUBLERX V3 pool.
const TARGET_DURIAN = 0;

const abs = (x: bigint) => (x < 0n ? -x : x);

const fetch = async (options: FetchOptions) => {
  const { createBalances, getLogs } = options;
  const dailyVolume = createBalances();
  const dailyFees   = createBalances();
  const dailySupplySideRevenue = createBalances();
  const dailyRevenue   = createBalances();

  // 1) Enumerate every BCM market ever spawned (historical scan). V4.6.7 is
  //    kept apart because its Graduated event has a different hash.
  const [logsV45, logsV466, logsV467, v3PoolLogs] = await Promise.all([
    getLogs({ target: FACTORY_V45,  eventAbi: TOKEN_CREATED_ABI,      fromBlock: 30_999_992, cacheInCloud: true }),
    getLogs({ target: FACTORY_V466, eventAbi: TOKEN_CREATED_ABI,      fromBlock: 31_393_573, cacheInCloud: true }),
    getLogs({ target: FACTORY_V467, eventAbi: TOKEN_CREATED_ABI_V467, fromBlock: 32_196_516, cacheInCloud: true }),
    getLogs({ target: DURIAN_V3_FACTORY, eventAbi: POOL_CREATED_ABI,  fromBlock: DURIAN_V3_FACTORY_BLOCK, cacheInCloud: true }),
  ]);

  const toMarkets = (logs: any[]): string[] =>
    logs
      .map((l: any) => (l.market ?? l[1]) as string)
      .filter((a) => a && a !== ZERO);

  const markets     = toMarkets([...logsV45, ...logsV466]);
  const marketsV467 = toMarkets(logsV467);

  // 2) Pull Graduated logs from those markets to discover AMM pools.
  //    Many markets never graduate — that's fine, they emit nothing.
  const noLogs: any[] = [];
  const [gradLogs, gradLogsV467] = await Promise.all([
    markets.length
      ? getLogs({ targets: markets, eventAbi: GRADUATED_ABI, fromBlock: 30_999_992, cacheInCloud: true })
      : noLogs,
    marketsV467.length
      ? getLogs({ targets: marketsV467, eventAbi: GRADUATED_ABI_V467, fromBlock: 32_196_516, cacheInCloud: true })
      : noLogs,
  ]);
  // V4.6.7 emits `Graduated` for BOTH of its targets, and for a KUBLERX
  // graduation the `ammPool` param is an external KUBLERX V3 pool — that
  // venue's volume belongs to KUBLERX's own adapter, so keep only
  // target == 0 (TARGET_DURIAN, an in-house DurianAMM pool).
  const durianGradsV467 = gradLogsV467.filter(
    (l: any) => Number(l.target ?? l[6]) === TARGET_DURIAN
  );
  const pools: string[] = [...gradLogs, ...durianGradsV467]
    .map((l: any) => (l.ammPool ?? l[2]) as string)
    .filter((a) => a && a !== ZERO);

  // 3) Durian V3 pools — skip anything that is not KKUB-quoted (graduation
  //    cannot create those). `flatten: false` later keeps one log array per
  //    pool so we can apply that pool's KKUB side and fee tier.
  const v3Pools: { pool: string; kkubIsToken0: boolean; fee: bigint }[] = [];
  for (const l of v3PoolLogs as any[]) {
    const token0 = String(l.token0 ?? l[0]);
    const token1 = String(l.token1 ?? l[1]);
    const fee    = BigInt(l.fee ?? l[2]);
    const pool   = String(l.pool ?? l[4]);
    const kkubIsToken0 = token0.toLowerCase() === KKUB.toLowerCase();
    if (!kkubIsToken0 && token1.toLowerCase() !== KKUB.toLowerCase()) continue;
    v3Pools.push({ pool, kkubIsToken0, fee });
  }

  if (pools.length === 0 && v3Pools.length === 0) {
    return { dailyVolume, dailyFees, dailyRevenue, dailySupplySideRevenue };
  }

  // 4) Sum swap events from every discovered pool in the daily window.
  const [swaps, v3LogsByPool] = await Promise.all([
    pools.length ? getLogs({ targets: pools, eventAbi: SWAPPED_ABI }) : noLogs,
    v3Pools.length
      ? getLogs({ targets: v3Pools.map((p) => p.pool), eventAbi: V3_SWAP_ABI, flatten: false })
      : noLogs,
  ]);

  for (const log of swaps) {
    const kubForToken = (log as any).kubForToken;
    const amountIn    = BigInt((log as any).amountIn);
    const amountOut   = BigInt((log as any).amountOut);
    const fee         = BigInt((log as any).fee);
    const treasury = (fee * 3n) / 10n;

    // Gross KUB notional.
    const volumeKub = kubForToken ? amountIn : (amountOut + fee);

    dailyVolume.add(KKUB, volumeKub);
    dailyFees.add(KKUB, fee, METRIC.SWAP_FEES);
    dailyRevenue.add(KKUB, treasury, METRIC.SWAP_FEES);
    dailySupplySideRevenue.add(KKUB, fee - treasury, METRIC.LP_FEES);
  }

  // 5) Durian V3 pools — the whole swap fee accrues to liquidity providers
  //    (no protocol fee is enabled on these pools).
  v3LogsByPool.forEach((logs: any[], i: number) => {
    const { kkubIsToken0, fee: feeTier } = v3Pools[i];
    for (const log of logs) {
      const volumeKub = abs(BigInt(kkubIsToken0 ? log.amount0 : log.amount1));
      if (volumeKub === 0n) continue;
      const fee = (volumeKub * feeTier) / 1_000_000n;
      dailyVolume.add(KKUB, volumeKub);
      dailyFees.add(KKUB, fee, METRIC.SWAP_FEES);
      dailySupplySideRevenue.add(KKUB, fee, METRIC.LP_FEES);
    }
  });

  return { dailyVolume, dailyFees, dailyRevenue, dailySupplySideRevenue };
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.BITKUB]: {
      fetch,
      start: "2026-04-29",
    },
  },
  methodology: {
    Volume: `Sum of gross KUB notional from every Swapped event emitted by graduated DurianAMM pools, plus the KKUB-side notional of every Swap on a Durian V3 graduation pool`,
    Fees: "1% fee on every DurianAMM swap; 0.3% on Durian V3 pools",
    Revenue: "30% of the 1% DurianAMM fee is kept by the protocol treasury; Durian V3 pools charge no protocol fee",
    SupplySideRevenue: "70% of the 1% DurianAMM fee goes to liquidity providers; the full 0.3% Durian V3 fee goes to liquidity providers",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: "1% trading fee on every DurianAMM swap; 0.3% on Durian V3 graduation pools.",
    },
    Revenue: {
      [METRIC.SWAP_FEES]: "30% of the 1% DurianAMM trading fee is kept by the protocol treasury.",
    },
    SupplySideRevenue: {
      [METRIC.LP_FEES]:   "70% of the 1% DurianAMM trading fee, and the full 0.3% Durian V3 fee, go to liquidity providers.",
    },
  },
};

export default adapter;
