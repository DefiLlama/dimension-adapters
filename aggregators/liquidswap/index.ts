import {
    FetchOptions,
    FetchResult,
    SimpleAdapter,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const SwapExecutedEvent =
    "event SwapExecuted(address indexed sender, address input_token_address, uint256 input_token_amount, address output_token_address, uint256 output_token_amount, uint256 timestamp)";

const PositiveSlippageCapturedEvent =
    "event PositiveSlippageCaptured(address indexed sender, address protocolRecipient, address feeRecipient, address token, uint256 expectedAmount, uint256 actualAmount, uint256 totalCapturedAmount, uint256 capturedToProtocol, uint256 capturedToFeeRecipient, uint256 timestamp)";

const FeeCapturedEvent =
    "event FeeCaptured(address indexed sender, address feeRecipient, address protocolFeeRecipient, address token, uint256 totalFee, uint256 feeToRecipient, uint256 feeToProtocolRecipient, uint256 timestamp)";

const LIQUIDSWAP_ADDRESS = "0x744489ee3d540777a66f2cf297479745e0852f7a";

// const PROTOCOL_FEE_ADDRESS = "0xaC7d51dB236fae22Ceb6453443da248F3A53f94d";

const fetch: any = async (options: FetchOptions): Promise<FetchResult> => {
    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();

    // Get SwapExecuted events for volume
    const swapLogs = await options.getLogs({
        target: LIQUIDSWAP_ADDRESS,
        eventAbi: SwapExecutedEvent,
    });
    for (const swapLog of swapLogs) {
        dailyVolume.add(swapLog.input_token_address, swapLog.input_token_amount);
    }

    // Get PositiveSlippageCaptured events for positive slippage revenue
    const slippageLogs = await options.getLogs({
        target: LIQUIDSWAP_ADDRESS,
        eventAbi: PositiveSlippageCapturedEvent,
    });
    for (const slippageLog of slippageLogs) {
        // Add positive slippage to fees and revenue
        dailyFees.add(
            slippageLog.token,
            slippageLog.totalCapturedAmount
        );
        dailyRevenue.add(
            slippageLog.token,
            slippageLog.totalCapturedAmount
        );

        dailyProtocolRevenue.add(
            slippageLog.token,
            slippageLog.capturedToProtocol
        );
    }

    // Get FeeCaptured events for fees
    const feeLogs = await options.getLogs({
        target: LIQUIDSWAP_ADDRESS,
        eventAbi: FeeCapturedEvent,
    });
    for (const feeLog of feeLogs) {
        // Add total fees to fees and revenue
        dailyFees.add(
            feeLog.token,
            feeLog.totalFee
        );
        dailyRevenue.add(
            feeLog.token,
            feeLog.totalFee
        );

        // add fees to protocol amount
        dailyProtocolRevenue.add(
            feeLog.token,
            feeLog.feeToProtocolRecipient
        );
    }

    return {
        dailyVolume,
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue,
    };
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    start: "2025-04-02",
    methodology: {
        Volume: "Volume is calculated from SwapExecuted events emitted by the LiquidSwap aggregator contract.",
        Fees: "Fees are tracked from PositiveSlippageCaptured and FeeCaptured events.",
        Revenue: "Revenue represents the protocol and intergators share of captured positive slippage and fees.",
        ProtocolRevenue: "Revenue represents the protocol share of captured positive slippage and fees.",
    },
    chains: [CHAIN.HYPERLIQUID],
};

export default adapter;
