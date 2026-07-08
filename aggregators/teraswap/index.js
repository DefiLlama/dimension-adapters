/**
 * TeraSwap — DefiLlama dimension-adapter (Dexs → Aggregator).
 *
 * TeraSwap is a DEX META-AGGREGATOR: user funds route through other DEXes'
 * routers (1inch, 0x, Uniswap, Velora, …) and never sit in a TeraSwap
 * contract, so on-chain TVL is ~0 by design. The correct DefiLlama listing is
 * VOLUME + FEES via the `DefiLlama/dimension-adapters` repo — NOT the
 * `DefiLlama-Adapters` TVL repo. This file is a dev/record artifact for that
 * PR; it is READ-ONLY with respect to the TeraSwap contracts (no on-chain
 * write, no protocol change).
 *
 * Event source — `TeraSwapFeeCollector.sol` (contracts/TeraSwapFeeCollector.sol,
 * the SAME source deployed on both chains below), read directly from the repo:
 *
 *   event SwapWithFee(
 *     address indexed user,
 *     address indexed router,
 *     address tokenIn,
 *     uint256 totalAmount,   // pre-fee swap notional, in tokenIn
 *     uint256 feeAmount,     // FEE_BPS(10)/BPS_DENOMINATOR(10_000) of totalAmount = 0.1%
 *     address tokenOut,
 *     uint256 outputAmount   // amount delivered to the user, in tokenOut
 *   );
 *
 * Emitted exactly once per fee-collected swap (both swapETHWithFee and
 * swapTokenWithFee funnel through the same internal _collectFee + emit path).
 * `topic0` for this event (`SwapWithFee(address,address,address,uint256,uint256,address,uint256)`)
 * is already hardcoded and load-bearing elsewhere in this repo — see
 * `TOPICS.SwapWithFee` in `src/lib/on-chain-monitor.ts` — so this is the SAME
 * signature the FeeCollector's own on-chain monitor already keys off of, not a
 * new/guessed one.
 *
 *   - Volume  = Σ totalAmount, priced in tokenIn (the pre-fee notional the
 *               user committed to the swap).
 *   - Fees    = Σ feeAmount, priced in tokenIn (feeAmount and totalAmount are
 *               the SAME token, so no cross-token conversion is needed here).
 *   - Revenue = Fees. TeraSwap keeps 100% of the 0.1% (no fee-sharing with the
 *               underlying DEX/router — the fee is taken BEFORE the swap is
 *               forwarded, see the contract's NatSpec flow comment).
 *
 * NOT used: `price_at_execution`/oracle reads — DefiLlama's own price API
 * (via `options.createBalances()` in the dimension-adapters SDK) resolves
 * tokenIn/tokenOut to USD from the raw on-chain amounts, exactly like every
 * other aggregator adapter in that repo (1inch, 0x, Odos, …).
 *
 * Deployed FeeCollector V2 addresses (same contract source, two chains):
 *   ethereum (mainnet): 0x47f24068932Ac49bcbeD3aD105af57C6ECDF7459
 *   base:                0xeFC31ADb5d10c51Ac4383bB770E2fdC65780f130
 *
 * ── Target repo note ─────────────────────────────────────────────────────
 * This file lives here (TeraSwap repo) for the record. To actually list on
 * DefiLlama, fork `DefiLlama/dimension-adapters` and add this (adjusted to
 * that repo's current helper import paths/SDK version at PR time) as
 * `dexs/teraswap/index.js`. See PR-NOTE.md in this directory for the exact
 * submission steps + the one-paragraph methodology text for the PR.
 */

const { CHAIN } = require('../helpers/chains') // dimension-adapters helper — path relative to the FORK, adjust on import
const { Adapter, FetchOptions } = require('../adapter.type') // types only; erased at runtime for a plain .js adapter

// [SwapWithFee topic0 — mirrors TOPICS.SwapWithFee in src/lib/on-chain-monitor.ts]
const SWAP_WITH_FEE_EVENT =
  'event SwapWithFee(address indexed user, address indexed router, address tokenIn, uint256 totalAmount, uint256 feeAmount, address tokenOut, uint256 outputAmount)'

// FEE_BPS = 10, BPS_DENOMINATOR = 10_000 on-chain (contracts/TeraSwapFeeCollector.sol) — 0.1%.
// Not used directly (feeAmount is read straight off each event, exact per-tx),
// kept here as a comment-level cross-check for the methodology paragraph.
const FEE_BPS = 10
const BPS_DENOMINATOR = 10_000

const FEE_COLLECTOR_BY_CHAIN = {
  [CHAIN.ETHEREUM]: '0x47f24068932Ac49bcbeD3aD105af57C6ECDF7459',
  [CHAIN.BASE]: '0xeFC31ADb5d10c51Ac4383bB770E2fdC65780f130',
}

/**
 * @param {*} _fromTimestamp unused — FetchOptions carries the resolved range
 * @param {*} _toTimestamp unused
 * @param {FetchOptions} options dimension-adapters FetchOptions: { chain, getLogs, createBalances, ... }
 */
const fetch = async (_fromTimestamp, _toTimestamp, options) => {
  const target = FEE_COLLECTOR_BY_CHAIN[options.chain]
  if (!target) throw new Error(`No FeeCollector configured for chain ${options.chain}`)

  // Standard dimension-adapters getLogs/block framework — resolves the block
  // range from options.startTimestamp/options.endTimestamp internally.
  const logs = await options.getLogs({
    target,
    eventAbi: SWAP_WITH_FEE_EVENT,
  })

  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()

  for (const log of logs) {
    // totalAmount and feeAmount are BOTH denominated in tokenIn (feeAmount is
    // taken out of totalAmount before the swap is forwarded) — a single
    // createBalances().add(tokenIn, amount) call prices each correctly via
    // DefiLlama's own price resolution, no manual USD conversion here.
    dailyVolume.add(log.tokenIn, log.totalAmount)
    dailyFees.add(log.tokenIn, log.feeAmount)
  }

  // TeraSwap takes no cut of its own 0.1% fee for anyone else — 100% is
  // protocol revenue (no LP/veToken/treasury split at the FeeCollector layer).
  const dailyRevenue = dailyFees.clone()

  return { dailyVolume, dailyFees, dailyRevenue }
}

/** @type {Adapter} */
const adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      // FeeCollector V2 (0x47f2…7459) deployment on mainnet — 2026-05-08 UTC.
      start: 1778198400,
    },
    [CHAIN.BASE]: {
      fetch,
      // FeeCollector deployment on Base (0xeFC3…f130) — 2026-05-30 UTC.
      start: 1780099200,
    },
  },
  methodology: {
    Volume:
      'Sum of totalAmount (the pre-fee swap notional a user commits, in tokenIn) from every SwapWithFee event emitted by the TeraSwapFeeCollector proxy — the single contract every TeraSwap swap routes fee-collection through before being forwarded to the underlying DEX router.',
    Fees: 'A flat 0.1% (10 bps) fee taken by the FeeCollector on every swap, read directly from the feeAmount field of each SwapWithFee event (no estimation — the exact on-chain value).',
    Revenue: "100% of Fees. TeraSwap does not share the 0.1% fee with routers, LPs, or any third party — it is pure protocol revenue collected before the swap is forwarded.",
  },
}

module.exports = adapter
