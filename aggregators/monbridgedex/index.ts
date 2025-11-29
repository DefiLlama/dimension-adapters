import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";

const CONTRACTS: Record<string, string> = {
  [CHAIN.MONAD]: "0x7dD7FC9380e3107028a158f49Bd25A8A8D48b225",
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
    if (!log.args) continue;
    const { tokenIn, amountIn } = log.args;
    if (!tokenIn || !amountIn) continue;
    dailyVolume.add(tokenIn, amountIn);
  }

  console.log("Daily volume result:", dailyVolume);

  return {
    dailyVolume,
  };
};

const adapter: any = {
  version: 2,
  adapter: {
    [CHAIN.MONAD]: {
      fetch,
      start: "2025-11-28",
    },
  },
};

export default adapter;
