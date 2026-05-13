/**
 * Durianfun Aggregator — DEX-aggregator volume adapter.
 *
 * PR target: https://github.com/DefiLlama/dimension-adapters
 * Final path: `aggregators/durianfun/index.ts`
 *
 * ── Protocol ───────────────────────────────────────────────────────
 *
 * `DurianAggregatorRouter` is a Jupiter-style atomic multi-DEX router
 * on Bitkub Chain. There are TWO deployed generations:
 *
 *   V1 (canonical pre-V466 router, LIVE for pure-V4.5/Udonswap routes):
 *     - Address: 0x5078cE74728bC3F1313B55A04B79E227E1181918
 *     - Predecessors (paused, kept for historical-continuity sum):
 *         V3.1:          0xB85E049484f5c44A8D1407fF372081Fe3e2455BC
 *         V4 unpatched:  0x6334f9dbC8AE789DD642a915Ce884B65A887a4aC
 *     - Swapped event (7 fields, NO referrer):
 *         Swapped(user, tokenIn, tokenOut, amountIn, amountOutToUser,
 *                 fee, hops)
 *
 *   V2 (V4.6.6-aware aggregator, LIVE — deployed 2026-05-09):
 *     - Address: 0xf3d6896A5dCB6896d6F2DB55D6Eb0b41496f0215
 *     - Swapped event (8 fields, ADDS `referrer`):
 *         Swapped(user, tokenIn, tokenOut, amountIn, amountOutToUser,
 *                 fee, hops, referrer)
 *
 * The two ABIs share keccak-prefix `Swapped(address,...)` but the
 * topic-0 hashes differ because the trailing `referrer` field changes
 * the canonical signature string. We register BOTH ABIs against BOTH
 * router-address sets so DefiLlama's volume series is continuous
 * across the V1→V2 cutover.
 *
 * ── Volume formula ─────────────────────────────────────────────────
 *
 *   dailyVolume = Σ(amountOutToUser × tokenOutUsd)
 *
 * Why `amountOutToUser`, not `amountIn`:
 *   - It's the value the user ACTUALLY received (post-fee).
 *   - For aggregators, input may be a long-tail meme; output side is
 *     more likely to be a priced asset (KKUB / stables).
 *   - DefiLlama treats DEX volume as "trade size in USD" — output
 *     after slippage + fee is the closest match.
 *
 * Unpriced tokenOut (memecoin-only routes that didn't terminate at
 * KKUB/stable) contribute 0 to dailyVolume — acceptable trade-off
 * versus emitting fake USD.
 *
 * ── Chain key ──────────────────────────────────────────────────────
 *
 * Uses "bitkub" (DefiLlama's chain registry key for Bitkub Chain).
 * TODO: verify against latest @defillama/sdk — if dimension-adapters'
 * `helpers/chains.ts` exports `CHAIN.BITKUB`, prefer that over the
 * string literal for type-safety.
 */

// TODO: verify against latest @defillama/sdk — FetchOptions / SimpleAdapter
// shapes vary slightly across dimension-adapters repo versions. The shape
// used here matches the structure observed in `aggregators/odos/index.ts`
// and `aggregators/jupiter-aggregator/index.ts` as of repo HEAD ~2025-Q4.
import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// V1 routers (7-arg Swapped). Include all predecessors so the
// historical volume series is continuous before V2 cutover.
const ROUTERS_V1: string[] = [
  "0x5078cE74728bC3F1313B55A04B79E227E1181918", // V4-patched (current V1 LIVE)
  "0x6334f9dbC8AE789DD642a915Ce884B65A887a4aC", // V4 unpatched (paused)
  "0xB85E049484f5c44A8D1407fF372081Fe3e2455BC", // V3.1 (paused)
];

// V2 routers (8-arg Swapped with trailing `referrer`).
const ROUTERS_V2: string[] = [
  "0xf3d6896A5dCB6896d6F2DB55D6Eb0b41496f0215", // V2 LIVE (2026-05-09)
];

const SWAPPED_ABI_V1 =
  "event Swapped(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOutToUser, uint256 fee, uint8 hops)";

const SWAPPED_ABI_V2 =
  "event Swapped(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOutToUser, uint256 fee, uint8 hops, address referrer)";

const fetch = async ({ createBalances, getLogs }: FetchOptions) => {
  const dailyVolume = createBalances();

  // Process V1 routers (predecessors + current V1).
  for (const router of ROUTERS_V1) {
    const logs = await getLogs({
      target: router,
      eventAbi: SWAPPED_ABI_V1,
    });
    for (const log of logs) {
      // amountOutToUser is the user-realized output. Add it under
      // tokenOut — DefiLlama's oracle converts to USD per chain.
      dailyVolume.add(log.tokenOut, log.amountOutToUser);
    }
  }

  // Process V2 routers (different event ABI / topic-0 hash).
  for (const router of ROUTERS_V2) {
    const logs = await getLogs({
      target: router,
      eventAbi: SWAPPED_ABI_V2,
    });
    for (const log of logs) {
      dailyVolume.add(log.tokenOut, log.amountOutToUser);
    }
  }

  return { dailyVolume };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.BITKUB]: {
      fetch,
      // First aggregator-emitted Swapped event was at block 31,205,300
      // (timestamp 1777186432, 2026-04-26 — V3.1 deploy). Use that as
      // `start` so DefiLlama doesn't waste cycles backfilling
      // pre-deploy windows.
      start: "2026-04-26",
      meta: {
        methodology: {
          Volume:
            "Sum of `amountOutToUser` across every Swapped event emitted " +
            "by DurianAggregatorRouter V1 (predecessors V3.1, V4-unpatched, " +
            "V4-patched) and V2, priced in USD via DefiLlama's oracle. " +
            "V1 and V2 use different Swapped ABIs (V2 adds a trailing " +
            "`referrer` field); both are summed for historical continuity. " +
            "Memecoin-side volume the oracle can't resolve contributes 0 " +
            "(no fake-USD inflation).",
        },
      },
    },
  },
};

export default adapter;
