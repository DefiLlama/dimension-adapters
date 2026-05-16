import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// ─────────────────────────────────────────────
// DEXR — DEX Aggregator
// https://dexr.finance
//
// Multi-chain volume tracking via SwapExecuted events emitted by the
// FeeAggregatorMaster contract. Each event represents a single swap
// routed through one of the chain's adapters (Uniswap V3/V4,
// Aerodrome / Velodrome family, Balancer V2/V3, PancakeSwap V3,
// THENA, Kumbaya, Prism, etc.).
//
// The Master contract is the same code on every chain — only the
// adapter set and deployed address differ. That uniformity is what
// makes one adapter file cover all four chains: same event ABI,
// same fee semantics (0.3% on tokenIn), same revenue path (100% to
// the Gnosis Safe replicated across chains via CREATE2).
//
// Scope of this adapter:
//   ✓ DEXR Master swaps on Base, Optimism, MegaETH, BNB Chain
//   ✗ LI.FI bridge / cross-chain swap volume (NOT included here)
//
// Why LI.FI volume is excluded: DEXR is a *direct* LI.FI integrator
// (registered at portal.li.fi as integrator "DEXR" with a 30 BPS fee)
// for cross-chain bridges and same-chain fallback on unsupported
// chains. Those swaps don't pass through the Master contract — they
// go through LI.FI's Diamond contract on each chain, which doesn't
// emit SwapExecuted. The fee paid via LI.FI accrues to the same Safe
// but is withdrawn through portal.li.fi rather than collected
// on-chain at swap time. Tracking that volume requires LI.FI's
// Analytics API (separate adapter — likely belongs under
// bridge-aggregators/, not aggregators/).
// ─────────────────────────────────────────────

// Master contract address per chain. Same Solidity (FeeAggregatorMaster.sol)
// at each address — chain-specific adapter wiring lives off-chain in
// the `registerAdapter` calls made at deploy time.
//
// Note: Optimism and BNB Chain share the same Master address
// (0x7eEdb990…F9377) because the contract was deployed via CREATE2
// with the same salt + bytecode on both chains. They are independent
// deployments — the address collision is by construction, not a typo.
const MASTER_ADDRESS: Record<string, string> = {
    [CHAIN.BASE]:     "0x4859608579D0f01605F6824ea173072a7Cc206c5",
    [CHAIN.OPTIMISM]: "0x7eEdb990a85Fd147BDCdDA651F9419E2741F9377",
    [CHAIN.MEGAETH]:  "0x094AAbf518B483713Fc920eCf8af0922F8E51EFD",
    [CHAIN.BSC]:      "0x7eEdb990a85Fd147BDCdDA651F9419E2741F9377",
};

const SWAP_EXECUTED_EVENT =
    "event SwapExecuted(address indexed user, uint8 indexed adapterId, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 feeAmount)";

async function fetch(options: FetchOptions) {
    // SEPARATE balance objects for volume / fees / revenue.
    // Do not share references — the framework may post-process each
    // independently, so a shared object would conflate the three.
    const dailyVolume  = options.createBalances();
    const dailyFees    = options.createBalances();
    const dailyRevenue = options.createBalances();

    const target = MASTER_ADDRESS[options.chain];
    if (!target) {
        // Defensive guard — should never trip because `chains` below
        // is the source of truth, but keeps the function honest if
        // the framework ever passes a chain we haven't configured.
        return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue };
    }

    const logs = await options.getLogs({
        target,
        eventAbi: SWAP_EXECUTED_EVENT,
    });

    for (const log of logs) {
        // Volume: sum the *output* token value (industry standard for
        // aggregators). tokenOut is what the user actually receives,
        // after slippage and pool fees.
        dailyVolume.add(log.tokenOut, log.amountOut);

        // Fees: 0.3% protocol fee taken from tokenIn before forwarding
        // to the adapter. Matches feeBps=30 set in the Master constructor.
        dailyFees.add(log.tokenIn, log.feeAmount, METRIC.SWAP_FEES);

        // Revenue: 100% of fees flow to the multisig (no token holders,
        // no buyback). The multisig is the same Safe address replicated
        // to each chain via CREATE2 (0xD55cE54Ce3e0985867CD57f4266c27a5b060D665).
        dailyRevenue.add(log.tokenIn, log.feeAmount, METRIC.SWAP_FEES);
    }

    return {
        dailyVolume,
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
    };
}

const methodology = {
    Volume: "Volume is the sum of tokenOut amounts from SwapExecuted events emitted by the DEXR FeeAggregatorMaster contract on each supported chain (Base, Optimism, MegaETH, BNB Chain). tokenOut represents the asset received by the user after the swap completes. Note: this counts only swaps that route through the on-chain Master contract; cross-chain bridges and same-chain swaps that fall back to LI.FI's router are not included here (DEXR is a direct LI.FI integrator but those flows accrue separately).",
    Fees: "DEXR charges a flat 0.3% protocol fee on the input token (tokenIn) of every swap. The feeAmount field of the SwapExecuted event captures this exactly. The same 0.3% rate applies to LI.FI-routed flows but those fees are collected via the LI.FI integrator portal, not on-chain — and are not counted here.",
    Revenue: "100% of the 0.3% protocol fee flows to a Gnosis Safe multisig (no token holders, no buyback). The same Safe address (0xD55cE54Ce3e0985867CD57f4266c27a5b060D665) is replicated across all chains. Revenue equals fees.",
};

const breakdownMethodology = {
    Fees: {
        [METRIC.SWAP_FEES]: "0.3% swap fee charged on input token before swap",
    },
    Revenue: {
        [METRIC.SWAP_FEES]: "0.3% swap fee charged on input token before swap",
    },
    ProtocolRevenue: {
        [METRIC.SWAP_FEES]: "0.3% swap fee charged on input token before swap",
    },
};

const adapter: Adapter = {
    version: 2,
    pullHourly: true,
    // Per-chain start dates. Base was deployed first; Optimism, MegaETH,
    // and BNB Chain followed once the adapter pattern proved stable.
    // Using per-chain `start` keys (not a top-level `start`) so DefiLlama
    // doesn't try to query historical events from before deployment
    // on chains that came online later.
    adapter: {
        [CHAIN.BASE]:     { fetch, start: "2026-05-04" },
        [CHAIN.OPTIMISM]: { fetch, start: "2026-05-09" },
        [CHAIN.MEGAETH]:  { fetch, start: "2026-05-10" },
        [CHAIN.BSC]:      { fetch, start: "2026-05-13" },
    },
    methodology,
    breakdownMethodology,
};

export default adapter;