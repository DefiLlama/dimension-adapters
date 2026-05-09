import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// ─────────────────────────────────────────────
// DEXR — DEX Aggregator on Base
// https://dexr.finance
//
// Volume is tracked via SwapExecuted events emitted by the FeeAggregatorMaster
// contract. Each event represents a single swap routed through one of 8 adapters
// (Uniswap V3/V4, Aerodrome, Slipstream, AlienBase, PancakeSwap V3, Balancer V2/V3).
// ─────────────────────────────────────────────

const FEE_AGGREGATOR_MASTER = "0x4859608579D0f01605F6824ea173072a7Cc206c5";

const SWAP_EXECUTED_EVENT =
    "event SwapExecuted(address indexed user, uint8 indexed adapterId, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 feeAmount)";

async function fetch({ getLogs, createBalances }: FetchOptions) {
    // Use SEPARATE balance objects for volume, fees, and revenue
    // (do not share references — framework may post-process them independently)
    const dailyVolume = createBalances();
    const dailyFees = createBalances();
    const dailyRevenue = createBalances();

    const logs = await getLogs({
        target: FEE_AGGREGATOR_MASTER,
        eventAbi: SWAP_EXECUTED_EVENT,
    });

    for (const log of logs) {
        // Volume: sum the *output* token value (industry standard for aggregators).
        // tokenOut is what the user actually receives, after slippage and pool fees.
        dailyVolume.add(log.tokenOut, log.amountOut);

        // Fees: 0.3% protocol fee taken from tokenIn before forwarding to adapter
        dailyFees.add(log.tokenIn, log.feeAmount, METRIC.SWAP_FEES);

        // Revenue: 100% of fees flow to the multisig (no token holders, no buyback)
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
    Volume: "Volume is the sum of tokenOut amounts from SwapExecuted events emitted by the DEXR FeeAggregatorMaster contract on Base. tokenOut represents the asset received by the user after the swap completes.",
    Fees: "DEXR charges a flat 0.3% protocol fee on the input token (tokenIn) of every swap. The feeAmount field of the SwapExecuted event captures this exactly.",
    Revenue: "100% of the 0.3% protocol fee flows to a Gnosis Safe multisig (no token holders, no buyback). Revenue equals fees.",
}

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
}

const adapter: Adapter = {
    version: 2,
    pullHourly: true,
    chains: [CHAIN.BASE],
    start: "2026-05-04",
    fetch,
    methodology,
    breakdownMethodology,
};

export default adapter;
