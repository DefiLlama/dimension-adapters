/**
 * PurrFlow Aggregator — DEX-aggregator volume adapter.
 * ── Protocol ───────────────────────────────────────────────────────
 *
 * PurrFlow (https://purrflow.xyz) is a trading terminal on Bitkub Chain
 * that routes every swap through its own atomic multi-DEX router,
 * `PurrflowAggregatorRouter` (on-chain contract name
 * DurianAggregatorRouterV3 — it is a source fork of the Durian V2.67
 * router, so the event surface is byte-identical).
 *
 *   Router: 0x6cbBBef3783CA0EfF752A1855206Fa4A69453b8c
 *           deployed 2026-07-17, first swap in block 33,558,791
 *
 * It aggregates across Udonswap, KUBLERX (V3), Junoswap, Diamond and the
 * Durian V4.5 / V4.6.6 / V4.6.7 launchpad curves + AMMs, wrapping and
 * unwrapping KKUB around each route so users trade in native KUB.
 *
 *   Swapped event (8 fields, identical ABI to the Durian V2 family):
 *     Swapped(user, tokenIn, tokenOut, amountIn, amountOutToUser,
 *             fee, hops, referrer)
 *
 * Fee: the router skims `markupBps` (currently 60 = 0.60%) from the
 * route, hard-capped at MAX_FEE_BPS = 100 (1.00%). On the normal path
 * the skim is taken from the OUTPUT token, which is what the `fee`
 * field carries and what this adapter prices; on the launchpad-BUY
 * fast path the same skim is taken on the input side in native KUB.
 * The skim accrues to the protocol treasury, so revenue == fees.
 */

import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";
import { METRIC } from "../../helpers/metrics"

const ROUTER = "0x6cbBBef3783CA0EfF752A1855206Fa4A69453b8c";

const SWAPPED_ABI =
  "event Swapped(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOutToUser, uint256 fee, uint8 hops, address referrer)";

const fetch = async ({ createBalances, getLogs, chain }: FetchOptions) => {
  const dailyVolume = createBalances();
  const dailyFees = createBalances();

  const logs = await getLogs({
    targets: [ROUTER],
    eventAbi: SWAPPED_ABI,
  });
  for (const log of logs) {
    addOneToken({ chain, balances: dailyVolume, token0: log.tokenIn, amount0: log.amountIn, token1: log.tokenOut, amount1: log.amountOutToUser })
    dailyFees.add(log.tokenOut, log.fee, METRIC.SWAP_FEES)
  }

  return { dailyVolume, dailyFees, dailyRevenue: dailyFees };
};

const methodology = {
  Volume: "Sum of swap volume routed through the PurrFlow Aggregator Router on Bitkub Chain.",
  Fees: "Router-skim fee deducted from every Swapped event (currently 0.60%), hard-capped at 1.00% per route.",
  Revenue: "100% of the swap fees accrue to the protocol treasury.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Router-skim fee deducted from each swap, currently 0.60% and hard-capped at 1.00% per route.",
  },
  Revenue: {
    [METRIC.SWAP_FEES]: "Router-skim fee deducted from each swap, currently 0.60% and hard-capped at 1.00% per route.",
  },
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.BITKUB]: {
      fetch,
      start: "2026-07-17",
    },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
