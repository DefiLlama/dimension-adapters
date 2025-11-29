import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";

const CONTRACTS: Record<string, string> = {
  [CHAIN.MONAD]: "0x7dd7fc9380e3107028a158f49bd25a8a8d48b225",
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  // SwapExecuted logs
  const swapLogs = await options.getLogs({
    target: CONTRACTS[options.chain],
    eventAbi:
      "event SwapExecuted(address indexed user, address indexed router, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 fee, uint256 actualSlippage, uint8 swapType)",
  });

  for (const log of swapLogs) {
    const { tokenIn, amountIn } = log.args;
    dailyVolume.add(tokenIn, amountIn);
  }

  // SplitSwapExecuted logs
  const splitSwapLogs = await options.getLogs({
    target: CONTRACTS[options.chain],
    eventAbi:
      "event SplitSwapExecuted(address indexed user, address tokenIn, address tokenOut, uint256 totalAmountIn, uint256 totalAmountOut, uint256 splitCount, uint256 totalFee)",
  });

  for (const log of splitSwapLogs) {
    const { tokenIn, totalAmountIn } = log.args;
    dailyVolume.add(tokenIn, totalAmountIn);
  }

  return {
    dailyVolume,
  };
};

const adapter: any = {
  version: 2,
  adapter: {
    [CHAIN.MONAD]: {
      fetch,
      start: "2025-11-27",
    },
  },
};

export default adapter;
