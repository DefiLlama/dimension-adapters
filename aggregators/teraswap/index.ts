// TeraSwap — DefiLlama dimension-adapter (Aggregators).
//
// Sums SwapWithFee events from TeraSwap's FeeCollector contracts across
// Ethereum mainnet (both the frozen V1 and live V2 deployments), Base, and
// Arbitrum One. Every per-chain comment below carries evidence an outside
// reviewer can check independently: chain id, the eth_getCode byte length
// measured on that chain, and the first SwapWithFee log's block and tx hash.
//
// Source: https://github.com/TeraHashAlpha/teraswap/blob/main/integrations/defillama/teraswap-adapter.ts

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

/**
 * Local decoded-log shape for `SwapWithFee`. DefiLlama's own
 * `FetchOptions.getLogs` returns `Promise<any[]>` — the SDK exports no type
 * for the fields an `eventAbi` decodes into, so this is declared locally
 * rather than imported; `any[]` is freely assignable to it.
 */
type SwapWithFeeLog = {
  tokenIn: string
  totalAmount: bigint
  feeAmount: bigint
}

const SWAP_WITH_FEE_EVENT =
  'event SwapWithFee(address indexed user, address indexed router, address tokenIn, uint256 totalAmount, uint256 feeAmount, address tokenOut, uint256 outputAmount)'

/**
 * The frozen mainnet V1 contract's own (5-arg) `SwapWithFee` shape. `tokenIn`
 * / `totalAmount` / `feeAmount` are in the same positions as
 * `SWAP_WITH_FEE_EVENT`, so `fetch` can decode both into the same
 * `SwapWithFeeLog` shape and sum them.
 */
const SWAP_WITH_FEE_EVENT_V1 =
  'event SwapWithFee(address indexed user, address indexed router, address tokenIn, uint256 totalAmount, uint256 feeAmount)'

/**
 * Sources that collect the SAME 0.1% through their own partner-fee params
 * instead of the FeeCollector, so they emit no `SwapWithFee` and are invisible
 * to this adapter.
 *
 * This MUST stay equal to the protocol's own list of fee-incompatible
 * sources — those that collect the identical fee through their own
 * partner-fee parameters instead of this contract, so they emit no
 * `SwapWithFee` and cannot be counted here.
 */
const EXCLUDED_SOURCES = ['0x', 'cowswap', 'bebop'] as const

/** Display names for `EXCLUDED_SOURCES`, keyed by the same source ids. */
const EXCLUDED_SOURCE_LABELS: Record<(typeof EXCLUDED_SOURCES)[number], string> = {
  '0x': '0x',
  cowswap: 'CoW Swap',
  bebop: 'Bebop',
}

// Rendered into the Volume methodology below, so the prose can never name a
// different set of sources than the list above.
const excludedLabels = EXCLUDED_SOURCES.map((s) => EXCLUDED_SOURCE_LABELS[s])
const excludedList =
  excludedLabels.length > 1
    ? `${excludedLabels.slice(0, -1).join(', ')} and ${excludedLabels[excludedLabels.length - 1]}`
    : excludedLabels.join('')

/**
 * FeeCollector per chain. Every address here was verified on its own chain
 * — never hand-typed — because the same address is, in one case below, a
 * DIFFERENT contract on a different chain (a deployer-nonce collision, not
 * the same deployment). Each entry carries its 42-char length sentinel and
 * the `eth_getCode` size measured on ITS OWN chain.
 *
 * Every `start` is likewise DERIVED from that chain's first on-chain
 * `SwapWithFee` log — never inherited from a config or prod-flip date — and
 * is then set to the UTC day BEFORE that log. That last step is not slack:
 * `start` is a RUN GATE, not a provenance annotation. For a
 * `pullHourly: true` adapter the runner splits the day into 24 one-hour
 * slots and runs a chain in the slot ending at `endTimestamp` only when
 * `start <= endTimestamp - 86400` (`setChainValidStart` in
 * `adapters/utils/runAdapter.ts`; the slots are built by `runHourlyMultiSlot`
 * in `cli/testAdapter.ts`). A `start` equal to the day being measured passes
 * that test for the LAST slot only (23:00–00:00 UTC) and skips the chain for
 * the other 23 — so a chain started on its own first-log day reports ZERO
 * for that day unless the log happens to land in the final hour. Measured
 * against DefiLlama's own harness on 2026-09-04: Base with
 * `start: '2026-06-04'` reported 0.00 for 2026-06-04, where the same file
 * and day with an earlier `start` reports 2.71k.
 *
 * Starting a day early costs nothing — the extra day holds no logs and sums
 * to zero — and each first-log block, tx and timestamp is recorded verbatim
 * per chain below, so the derivation stays checkable either way.
 */
const chainConfig: Record<
  string,
  { feeCollector: string; start: string; legacyFeeCollector?: string }
> = {
  // FeeCollector V2 (instant swaps), Ethereum Mainnet (chain id 1).
  // length sentinel 42 · eth_getCode on chain 1 (gateway.tenderly.co/public/mainnet) = 5,419 bytes.
  // start DERIVED: V2's first SwapWithFee is block 25,181,121, tx
  // 0xdeb17a805b0069c4641dd9e0e5e51bc88205f083bad288ad31dbb20ed296cdb6,
  // timestamp 1779818087 = 2026-05-26T17:54:47Z — NOT the mainnet start, since
  // `legacyFeeCollector` below has fills that predate it by 83 days. This
  // chain's `start` is derived from V1's first log instead (see the
  // legacyFeeCollector comment), replacing the previously configured
  // (unverified, and wrong either way) 2026-05-08.
  //
  // legacyFeeCollector: FeeCollector V1 (frozen), Ethereum Mainnet (chain id 1).
  // "deprecated, do not route here" for
  // ROUTING, but its 14 historical SwapWithFee logs are real settled volume
  // and belong in this adapter's count. length sentinel 42 · eth_getCode on
  // chain 1 = 5,826 bytes. start DERIVED: V1's first SwapWithFee is block
  // 24,585,100, tx 0xb42d6fda447057d1d84cdfbddd1ab8b3a22c83219a958e3414418d368a791973,
  // timestamp 1772639423 = 2026-03-04T15:50:23Z, the 2026-03-04 date in the
  // pre-V2 mainnet history this fixes — so `start` is 2026-03-03, the day
  // before, or the run gate above drops every hourly slot of 2026-03-04
  // except 23:00–00:00 and that opening day reads zero despite its two logs.
  // V1 emitted 14 SwapWithFee logs total (2026-03-04 through 2026-04-24, none
  // since; V2 has 23 to date, for 37 mainnet-wide) before V2 replaced it.
  [CHAIN.ETHEREUM]: {
    feeCollector: '0x47f24068932Ac49bcbeD3aD105af57C6ECDF7459',
    legacyFeeCollector: '0x4dAEAf24Cd300a3DBc0caff3292B7840CDDa58eD',
    start: '2026-03-03',
  },
  // FeeCollector (instant swaps), Base (chain id 8453).
  // length sentinel 42 · eth_getCode on chain 8453 (mainnet.base.org) = 5,339 bytes.
  // start DERIVED: Base's first SwapWithFee is block 46,884,917, tx
  // 0x8c79514e0e793e7889ecebb986b1a969c93c84e3cce366e5931b7c5d74fedb00,
  // timestamp 1780559181 = 2026-06-04T07:46:21Z, five days after the
  // contract's own deploy (block 46,697,561, 2026-05-30T23:41:09Z) — so
  // `start` is 2026-06-03, the day before that first fill. Base is the chain
  // the run gate above was measured on: with `start: '2026-06-04'` its own
  // opening day reported 0.00, against 2.71k as configured here.
  [CHAIN.BASE]: {
    feeCollector: '0xeFC31ADb5d10c51Ac4383bB770E2fdC65780f130',
    start: '2026-06-03',
  },
  // FeeCollector (instant swaps), Arbitrum One (chain id 42161).
  // Same 42-char string as the Base row — a deployer-nonce collision, a DIFFERENT
  // deployment; qualified by chain, verified on chain 42161 in its own right.
  // length sentinel 42 · eth_getCode on chain 42161 (arb1.arbitrum.io/rpc) = 5,339 bytes.
  // start DERIVED, not typed: the FIRST SwapWithFee log at this address on 42161 is
  // block 484,739,263 (tx 0xfa0dfc578960f7d720572de5d451ede06be38cc78ed2c39e00376b1cef4a658c),
  // timestamp 1784275673 = 2026-07-17T08:07:53Z — three days BEFORE the doc's
  // 2026-07-20 prod flip, so starting at the flip date would silently drop the
  // first of the chain's five SwapWithFee events (the other four are two on
  // 2026-07-20 and two on 2026-08-03; none since). `start` is 2026-07-16, the
  // day before that first log: at 08:07 UTC it is outside the only slot a
  // same-day `start` would have run, so 2026-07-17 would otherwise read zero.
  [CHAIN.ARBITRUM]: {
    feeCollector: '0xeFC31ADb5d10c51Ac4383bB770E2fdC65780f130',
    start: '2026-07-16',
  },
}

const fetch = async (options: FetchOptions) => {
  const cfg = chainConfig[options.chain]

  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()

  const accumulate = (log: SwapWithFeeLog) => {
    dailyVolume.add(log.tokenIn, log.totalAmount)
    dailyFees.add(log.tokenIn, log.feeAmount, METRIC.SWAP_FEES)
  }

  const logs = await options.getLogs({
    target: cfg.feeCollector,
    eventAbi: SWAP_WITH_FEE_EVENT,
  })
  for (const log of logs) accumulate(log)

  // Mainnet only: the frozen V1 contract's pre-V2 history, decoded from its
  // own (5-arg) event shape and summed into the same balances. Its address
  // and topic0 both differ from V2's, so this can never re-read a V2 log.
  if (cfg.legacyFeeCollector) {
    const legacyLogs = await options.getLogs({
      target: cfg.legacyFeeCollector,
      eventAbi: SWAP_WITH_FEE_EVENT_V1,
    })
    for (const log of legacyLogs) accumulate(log)
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const methodology = {
  Volume: `Sum of totalAmount (the pre-fee swap notional a user commits, in tokenIn) from every SwapWithFee event emitted by the TeraSwapFeeCollector proxy, the contract that collects the 0.1% on-chain before the trade is forwarded to the underlying DEX router. On Ethereum mainnet this aggregates both FeeCollector deployments — the frozen V1 contract and the live V2 contract that replaced it — so mainnet's reported history is continuous back to TeraSwap's first on-chain swap rather than starting at the V2 cutover. Not all TeraSwap volume reaches that contract: routes filled by ${excludedList} collect the identical 0.1% through those venues' own partner-fee parameters instead of the FeeCollector, emit no SwapWithFee event, and are therefore NOT counted here.`,
  Fees: 'A flat 0.1% (10 bps) fee taken by the FeeCollector on every swap, read directly from the feeAmount field of each SwapWithFee event (no estimation — the exact on-chain value).',
  Revenue: "A flat 0.1% (10 bps) fee taken by the FeeCollector on every swap, read directly from the feeAmount field of each SwapWithFee event (no estimation — the exact on-chain value).",
  ProtocolRevenue: "A flat 0.1% (10 bps) fee taken by the FeeCollector on every swap, read directly from the feeAmount field of each SwapWithFee event (no estimation — the exact on-chain value).",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: 'A flat 0.1% (10 bps) fee taken by the FeeCollector on every swap.',
  },
  Revenue: {
    [METRIC.SWAP_FEES]: 'A flat 0.1% (10 bps) fee taken by the FeeCollector on every swap.',
  },
  ProtocolRevenue: {
    [METRIC.SWAP_FEES]: 'A flat 0.1% (10 bps) fee taken by the FeeCollector on every swap.',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
}

export default adapter
