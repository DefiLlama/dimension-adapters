import { ethers } from "ethers";
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
const PROTOCOL_FEE_ADDRESS = "0xaC7d51dB236fae22Ceb6453443da248F3A53f94d";

const iface = new ethers.Interface([
    SwapExecutedEvent,
    PositiveSlippageCapturedEvent,
    FeeCapturedEvent,
]);

const fetch: any = async (options: FetchOptions): Promise<FetchResult> => {
    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    // Get SwapExecuted events for volume
    const swapLogs = await options.getLogs({ 
        target: LIQUIDSWAP_ADDRESS, 
        eventAbi: SwapExecutedEvent,
        entireLog: true 
    });
    
    swapLogs.forEach((log) => {
        const parsed = iface.parseLog(log);
        if (!parsed) return;
        
        // Add input token volume
        dailyVolume.add(parsed.args.input_token_address, parsed.args.input_token_amount);
    });

    // Get PositiveSlippageCaptured events for positive slippage revenue
    const slippageLogs = await options.getLogs({
        target: LIQUIDSWAP_ADDRESS,
        eventAbi: PositiveSlippageCapturedEvent,
        entireLog: true,
    });

    slippageLogs.forEach((log) => {
        const parsed = iface.parseLog(log);
        if (!parsed) return;

        // Add protocol revenue from positive slippage
        dailyRevenue.add(
            parsed.args.token,
            parsed.args.capturedToProtocol
        );

        // Check if feeRecipient is protocol address, if so add to protocol revenue
        if (parsed.args.feeRecipient.toLowerCase() === PROTOCOL_FEE_ADDRESS.toLowerCase()) {
            dailyRevenue.add(
                parsed.args.token,
                parsed.args.capturedToFeeRecipient
            );
        } else {
            // Add integrator revenue from positive slippage
            dailySupplySideRevenue.add(
                parsed.args.token,
                parsed.args.capturedToFeeRecipient
            );
        }

        // Add total captured amount as fees (protocol + integrator)
        dailyFees.add(
            parsed.args.token,
            parsed.args.totalCapturedAmount
        );
    });

    // Get FeeCaptured events for fees
    const feeLogs = await options.getLogs({
        target: LIQUIDSWAP_ADDRESS,
        eventAbi: FeeCapturedEvent,
        entireLog: true,
    });

    feeLogs.forEach((log) => {
        const parsed = iface.parseLog(log);
        if (!parsed) return;

        // Add protocol revenue from fees
        dailyRevenue.add(
            parsed.args.token,
            parsed.args.feeToProtocolRecipient
        );

        // Check if feeRecipient is protocol address, if so add to protocol revenue
        if (parsed.args.feeRecipient.toLowerCase() === PROTOCOL_FEE_ADDRESS.toLowerCase()) {
            dailyRevenue.add(
                parsed.args.token,
                parsed.args.feeToRecipient
            );
        } else {
            // Add integrator revenue from fees
            dailySupplySideRevenue.add(
                parsed.args.token,
                parsed.args.feeToRecipient
            );
        }

        // Add total fees (protocol + integrator)
        dailyFees.add(
            parsed.args.token,
            parsed.args.totalFee
        );
    });

    return { 
        dailyVolume,
        dailyFees,
        dailyRevenue,
        dailySupplySideRevenue
    };
};

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.HYPERLIQUID]: {
            fetch: fetch,
            start: "2025-04-02",
            meta: {
                methodology: {
                    Volume: "Volume is calculated from SwapExecuted events emitted by the LiquidSwap aggregator contract.",
                    Fees: "Fees are tracked from PositiveSlippageCaptured and FeeCaptured events.",
                    Revenue: "Revenue represents the protocol's share of captured positive slippage and fees.",
                    "Supply Side Revenue": "Supply side revenue represents amounts shared with integrators from fees and positive slippage.",
                },
            },
        },
    },
};

export default adapter;
