import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const SwapExecutedEvent =
  "event SwapExecuted(address indexed sender, address input_token_address, uint256 input_token_amount, address output_token_address, uint256 output_token_amount, uint256 timestamp)";

const PositiveSlippageCapturedEvent =
  "event PositiveSlippageCaptured(address indexed sender, address protocolRecipient, address feeRecipient, address token, uint256 expectedAmount, uint256 actualAmount, uint256 totalCapturedAmount, uint256 capturedToProtocol, uint256 capturedToFeeRecipient, uint256 timestamp)";

const FeeCapturedEvent =
  "event FeeCaptured(address indexed sender, address feeRecipient, address protocolFeeRecipient, address token, uint256 totalFee, uint256 feeToRecipient, uint256 feeToProtocolRecipient, uint256 timestamp)";

const LIQUIDSWAP_ADDRESS = "0x744489ee3d540777a66f2cf297479745e0852f7a";

// const PROTOCOL_FEE_ADDRESS = "0xaC7d51dB236fae22Ceb6453443da248F3A53f94d";

const METRICS = {
  SwapFees: 'Swap Fees',
  PositiveSlippageCaptured: 'Positive Slippage Captured',
  SwapFeesToIntergators: 'Swap Fees To Intergators',
  SwapFeesToProtocol: 'Swap Fees To Protocol',
  PositiveSlippageCapturedToIntergators: 'Positive Slippage Captured To Intergators',
  PositiveSlippageCapturedToProtocol: 'Positive Slippage Captured To Protocol',
}

const fetch: any = async (options: FetchOptions): Promise<FetchResult> => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

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
    dailyFees.add(slippageLog.token, slippageLog.totalCapturedAmount, METRICS.PositiveSlippageCaptured);
  
    const revenueToIntergators = BigInt(slippageLog.totalCapturedAmount) - BigInt(slippageLog.capturedToProtocol)
    dailyRevenue.add(slippageLog.token, slippageLog.capturedToProtocol, METRICS.PositiveSlippageCapturedToProtocol);
    dailySupplySideRevenue.add(slippageLog.token, revenueToIntergators, METRICS.PositiveSlippageCapturedToIntergators);
  }

  // Get FeeCaptured events for fees
  const feeLogs = await options.getLogs({
    target: LIQUIDSWAP_ADDRESS,
    eventAbi: FeeCapturedEvent,
  });
  for (const feeLog of feeLogs) {
    // Add total fees to fees and revenue
    dailyFees.add(feeLog.token, feeLog.totalFee, METRICS.SwapFees);
    
    const revenueToIntergators = BigInt(feeLog.totalFee) - BigInt(feeLog.feeToProtocolRecipient)
    dailyRevenue.add(feeLog.token, feeLog.feeToProtocolRecipient, METRICS.SwapFeesToProtocol);
    dailySupplySideRevenue.add(feeLog.token, revenueToIntergators, METRICS.SwapFeesToProtocol);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue: 0, // no revenue shared to holders
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
    Revenue: "Revenue represents the protocol share of captured positive slippage and fees.",
    ProtocolRevenue: "Revenue represents the protocol share of captured positive slippage and fees.",
    SupplySideRevenue: "The share of captured positive slippage and fees to integrators.",
    HoldersRevenue: 'No revenue shared to LIQD token holders',
  },
  breakdownMethodology: {
    Fees: {
      [METRICS.SwapFees]: 'Total swap fees paid by users per swap.',
      [METRICS.PositiveSlippageCaptured]: 'Profit from possitive slippage captured.',
    },
    Revenue: {
      [METRICS.SwapFeesToProtocol]: 'Swap fees share to protocol.',
      [METRICS.PositiveSlippageCapturedToProtocol]: 'Profit from possitive slippage shared to protocol.',
    },
    SupplySideRevenue: {
      [METRICS.SwapFeesToIntergators]: 'Swap fees share to intergators.',
      [METRICS.PositiveSlippageCapturedToIntergators]: 'Profit from possitive slippage shared to intergators.',
    },
    ProtocolRevenue: {
      [METRICS.SwapFeesToProtocol]: 'Swap fees share to protocol.',
      [METRICS.PositiveSlippageCapturedToProtocol]: 'Profit from possitive slippage shared to protocol.',
    },
  },
  chains: [CHAIN.HYPERLIQUID],
};

export default adapter;
