import type { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const AGGREGATOR = "0x311D2A611C59F11516256e14683fB6d9Bc3A97a4";

const swapEvent =
  "event SwapExecuted(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, address indexed recipient)";

const fetch = async ({ getLogs, createBalances }: FetchOptions) => {
  const dailyVolume = createBalances();

  const logs = await getLogs({
    target: AGGREGATOR,
    eventAbi: swapEvent,
  });

  for (const log of logs) {
    dailyVolume.add(log.tokenIn, log.amountIn);
  }

  return { dailyVolume };
};

export default {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.AVAX],
  start: "2026-04-13",
};
