/**
 * Durian AMM — post-graduation constant-product DEX adapter.
 *
 * PR target: https://github.com/DefiLlama/dimension-adapters
 * Final path: `dexs/durian-amm/index.ts`
 *
 * ── Protocol ───────────────────────────────────────────────────────
 *
 * When a Durianfun bonding-curve market hits its graduation
 * threshold, the BondingCurveMarket (BCM) contract migrates its
 * reserves to a freshly-deployed `DurianAMM` pool — a single-pair
 * constant-product AMM that quotes one launchpad token against
 * native KUB. Each market graduates into its own dedicated AMM
 * contract; there is no shared factory and no LP token registry.
 *
 * Two factory generations spawn BCM markets that graduate into
 * `DurianAMMV45` and `DurianAMMV466` respectively. The two AMM
 * contracts emit byte-for-byte identical `Swapped` event ABIs,
 * so a single adapter covers both.
 *
 * ── Event ABIs (confirmed identical V4.5 ⇄ V4.6.6) ─────────────────
 *
 *   BCM.Graduated(
 *       address indexed market,
 *       address indexed token,
 *       address indexed ammPool,
 *       uint256 kubRaised,
 *       uint256 treasuryFee,
 *       uint256 creatorReward)
 *
 *   AMM.Swapped(
 *       address indexed trader,
 *       bool    indexed kubForToken,
 *       uint256 amountIn,         ← gross if kubForToken (KUB in)
 *       uint256 amountOut,        ← net  if !kubForToken (KUB out, post-fee)
 *       uint256 fee,              ← treasury + LP share, in KUB
 *       uint256 newReserveKub,
 *       uint256 newReserveToken)
 *
 *   Factory.TokenCreated(
 *       address indexed token,
 *       address indexed market,
 *       address indexed creator,
 *       string name, string symbol,
 *       uint256 totalSupply, uint256 timestamp)
 *
 * ── Volume / Fees methodology ──────────────────────────────────────
 *
 *   kubForToken == true   (user buys token with KUB):
 *       volumeKub = amountIn          (already gross)
 *
 *   kubForToken == false  (user sells token for KUB):
 *       volumeKub = amountOut + fee   (re-add fee to get gross)
 *
 *   dailyVolume = Σ volumeKub  for every Swapped event
 *   dailyFees   = Σ fee        for every Swapped event
 *
 * Fees are split between the project treasury (~0.3 %) and the LP
 * share (~0.7 %), but DefiLlama tracks them in aggregate. There is
 * no governance token, so the treasury portion is realised revenue.
 *
 * ── Discovery ──────────────────────────────────────────────────────
 *
 * Pools are *not* tracked by any registry. We discover them by:
 *   1. Listing every BCM market spawned by either factory
 *      (TokenCreated since each factory's deploy block).
 *   2. Reading the `Graduated` event from each market — its 3rd
 *      indexed param is the AMM pool address.
 *
 * This is done historically (since genesis) on every fetch call,
 * so newly-graduated pools are picked up automatically. Per-day
 * `Swapped` logs are fetched in the daily window via `getLogs`.
 */

import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const FACTORY_V45  = "0xdf4f3dB298A9aDe853191F58b4b2a322D47EC005";
const FACTORY_V466 = "0x89b6b73BD18dbEA0e2218c25c1963fd5FBaB3c87";

// KKUB (wrapped KUB) — used to price native-KUB notionals in USD via
// DefiLlama's Bitkub Chain oracle.
const KKUB = "0x67eBD850304c70d983B2d1b93ea79c7CD6c3F6b5";

const TOKEN_CREATED_ABI =
  "event TokenCreated(address indexed token, address indexed market, address indexed creator, string name, string symbol, uint256 totalSupply, uint256 timestamp)";

const GRADUATED_ABI =
  "event Graduated(address indexed market, address indexed token, address indexed ammPool, uint256 kubRaised, uint256 treasuryFee, uint256 creatorReward)";

const SWAPPED_ABI =
  "event Swapped(address indexed trader, bool indexed kubForToken, uint256 amountIn, uint256 amountOut, uint256 fee, uint256 newReserveKub, uint256 newReserveToken)";

const ZERO = "0x0000000000000000000000000000000000000000";

const fetch = async (options: FetchOptions) => {
  const { createBalances, getLogs } = options;
  const dailyVolume = createBalances();
  const dailyFees   = createBalances();

  // 1) Enumerate every BCM market ever spawned (historical scan).
  const marketLogs = await Promise.all([
    getLogs({ target: FACTORY_V45,  eventAbi: TOKEN_CREATED_ABI, fromBlock: 30_999_992 }),
    getLogs({ target: FACTORY_V466, eventAbi: TOKEN_CREATED_ABI, fromBlock: 31_393_573 }),
  ]);
  const markets: string[] = marketLogs
    .flat()
    .map((l: any) => (l.market ?? l[1]) as string)
    .filter((a) => a && a !== ZERO);

  if (markets.length === 0) {
    return { dailyVolume, dailyFees, dailyRevenue: dailyFees };
  }

  // 2) Pull Graduated logs from those markets to discover AMM pools.
  //    Many markets never graduate — that's fine, they emit nothing.
  const gradLogs = await getLogs({
    targets: markets,
    eventAbi: GRADUATED_ABI,
    fromBlock: 30_999_992,
  });
  const pools: string[] = gradLogs
    .map((l: any) => (l.ammPool ?? l[2]) as string)
    .filter((a) => a && a !== ZERO);

  if (pools.length === 0) {
    return { dailyVolume, dailyFees, dailyRevenue: dailyFees };
  }

  // 3) Sum Swapped events from every discovered pool in the daily window.
  const swaps = await getLogs({ targets: pools, eventAbi: SWAPPED_ABI });

  for (const log of swaps) {
    const kubForToken = (log as any).kubForToken;
    const amountIn    = BigInt((log as any).amountIn.toString());
    const amountOut   = BigInt((log as any).amountOut.toString());
    const fee         = BigInt((log as any).fee.toString());

    // Gross KUB notional.
    const volumeKub = kubForToken ? amountIn : (amountOut + fee);

    dailyVolume.add(KKUB, volumeKub.toString());
    dailyFees.add(KKUB, fee.toString());
  }

  return { dailyVolume, dailyFees, dailyRevenue: dailyFees };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.BITKUB]: {
      fetch,
      // V4.5 factory deploy block 30,999,992 / 2026-04-29.
      // V4.6.6 spawns later (block 31,393,573) — covered by the same
      // start because its markets graduate strictly after this date.
      start: "2026-04-29",
      meta: {
        methodology: {
          Volume:
            "Sum of gross KUB notional from every Swapped event emitted by " +
            "DurianAMM pools that BondingCurveMarket contracts graduated " +
            "into. For KUB→token swaps, amountIn is used directly (already " +
            "gross). For token→KUB swaps, amountOut + fee is used (because " +
            "amountOut is the net amount the user received after fee). " +
            "Pools are discovered by scanning Graduated events emitted by " +
            "BCMs from the V4.5 factory (0xdf4f…C005) and V4.6.6 factory " +
            "(0x89b6…3c87). Amounts are credited to KKUB and priced via " +
            "DefiLlama's Bitkub Chain oracle.",
          Fees:
            "Sum of the on-chain `fee` field of every Swapped event. " +
            "Aggregates the treasury share (~0.3 % of gross) and the LP " +
            "share (~0.7 % of gross), denominated in native KUB.",
          Revenue:
            "Equal to Fees. There is no governance token and no " +
            "external rebate program; both the treasury cut and the LP " +
            "cut are realised on-chain protocol revenue from the issuer's " +
            "point of view.",
        },
      },
    },
  },
};

export default adapter;
