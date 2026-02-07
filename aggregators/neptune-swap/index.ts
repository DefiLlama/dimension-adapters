import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";

const AGGREGATOR_CONTRACT = '0xb3f2B217B024700b6B85bB0941d4958EF17214C1';

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const logs = await options.getLogs({
    target: AGGREGATOR_CONTRACT,
    eventAbi:
      "event SwapExecuted(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, uint256 taxCollected, uint256 timestamp)",
  });

  for (const log of logs) {
    dailyVolume.add(log.tokenOut, log.amountOut);
  }

  return { dailyVolume };
};

const adapter: any = {
  version: 2,
  adapter: {
    [CHAIN.CRONOS]: {
      fetch,
      start: '2025-01-01',
    },
  },
};

export default adapter;