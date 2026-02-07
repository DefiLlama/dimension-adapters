import { ChainBlocks, FetchOptions } from "../../adapters/types";

const AGGREGATOR_CONTRACT = '0xb3f2B217B024700b6B85bB0941d4958EF17214C1';

const fetch = async (timestamp: number, _: ChainBlocks, { createBalances, getLogs }: FetchOptions) => {
  const dailyVolume = createBalances();

  const logs = await getLogs({
    target: AGGREGATOR_CONTRACT,
    eventAbi: "event SwapExecuted(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, uint256 taxCollected, uint256 timestamp)",
  });

  logs.forEach((log: any) => {
    dailyVolume.add(log.tokenOut, log.amountOut);
  });

  return { timestamp, dailyVolume };
};

const adapter: any = {
  adapter: {
    cronos: {
      fetch,
      start: '2025-01-01',
    },
  },
};

export default adapter;