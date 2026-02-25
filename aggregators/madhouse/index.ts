import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";

const CONTRACTS: Record<string, string> = {
  [CHAIN.MONAD]: '0x6017684Bea9Cb6e9874fC6DBA4438271eBF9F5DA'
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()
  
  const swapLogs = await options.getLogs({
    target: CONTRACTS[options.chain],
    eventAbi: 'event SwapExecuted(address tokenIn, uint256 amountIn, address tokenOut, uint256 amountOut)',
  })
  
  for (const log of swapLogs) {
    dailyVolume.add(log.tokenIn, log.amountIn);
  }

  return {
    dailyVolume,
  };
};

const adapter: any = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.MONAD]: {
      fetch,
      start: '2025-11-23',
    },
  },
};

export default adapter;
