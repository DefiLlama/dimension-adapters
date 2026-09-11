import type { SimpleAdapter, FetchOptions, FetchResult } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addOneToken } from "../helpers/prices";

const ACCRUED_SWAP_ROUTER = "0xc78e883f87675e75334df4d341f6fcb0915ebf19";

const ACCRUED_SWAP_ABI =
  "event AccruedSwap(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, address recipient)";

async function fetch(options: FetchOptions): Promise<FetchResult> {
  const swapLogs = await options.getLogs({
    target: ACCRUED_SWAP_ROUTER,
    eventAbi: ACCRUED_SWAP_ABI,
  });

  const dailyVolume = options.createBalances();

  for (const log of swapLogs) {
    const tokenIn = String(log.tokenIn).toLowerCase();
    const tokenOut = String(log.tokenOut).toLowerCase();
    const amountIn = BigInt(log.amountIn);
    const amountOut = BigInt(log.amountOut);

    addOneToken({ balances: dailyVolume, token0: tokenIn, amount0: amountIn, token1: tokenOut, amount1: amountOut });
  }

  return { dailyVolume };
}

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.ROBINHOOD],
  fetch,
  start: "2026-09-10",
  pullHourly: true,
  methodology: {
    Volume:
      "Trading volume generated through Accrued on Robinhood Chain. Only swaps " +
      "emitting AccruedSwap from AccruedSwapRouter are included. One event per user trade; " +
      "internal Uniswap hops are not double-counted. USD uses stablecoin leg or token price oracles.",
  },
};

export default adapter;