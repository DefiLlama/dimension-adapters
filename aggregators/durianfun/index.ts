/**
 * Durianfun Aggregator — DEX-aggregator volume adapter.
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
 */

import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";

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

const fetch = async ({ createBalances, getLogs, chain }: FetchOptions) => {
  const dailyVolume = createBalances();

  // Process V1 routers (predecessors + current V1).
  const v1Logs = await getLogs({
    targets: ROUTERS_V1,
    eventAbi: SWAPPED_ABI_V1
  })
  for (const log of v1Logs) {
    addOneToken({ chain, balances: dailyVolume, token0: log.tokenIn, amount0: log.amountIn, token1: log.tokenOut, amount1: log.amountOutToUser })
  }

  // Process V2 routers (different event ABI / topic-0 hash).
  const v2Logs = await getLogs({
    targets: ROUTERS_V2,
    eventAbi: SWAPPED_ABI_V2,
  });
  for (const log of v2Logs) {
    addOneToken({ chain, balances: dailyVolume, token0: log.tokenIn, amount0: log.amountIn, token1: log.tokenOut, amount1: log.amountOutToUser })
  }

  return { dailyVolume };
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.BITKUB]: {
      fetch,
      start: "2026-04-26",
    },
  },
};

export default adapter;
