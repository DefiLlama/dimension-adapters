import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Source: Arcus app mainnet config, Robinhood Chain swap shell.
const chainConfig: Record<string, { start: string; swapShell: string }> = {
  [CHAIN.ROBINHOOD]: {
    start: "2026-06-11",
    swapShell: "0x4262efBd176F02824af27010bEa218429c33c7E8",
  },
};

const SWAP_EXECUTED_V2_BLOCK = 64677027;

const SWAP_EXECUTED_V1 =
  "event SwapExecuted(address indexed taker, address indexed tokenIn, address indexed tokenOut, uint256 minAmountOut, uint256 amountIn, uint256 quotedAmountIn, uint256 quotedAmountOut, uint256 amountOut, uint256 tokenInBenchmarkPrice, uint256 tokenOutBenchmarkPrice, address router, bytes32 routeTag, bool success, string reason)";
const SWAP_EXECUTED_V2 =
  "event SwapExecuted(address indexed taker, address indexed tokenIn, address indexed tokenOut, uint256 minAmountOut, uint256 amountIn, uint256 quotedAmountIn, uint256 quotedAmountOut, uint256 amountOut, uint256 tokenInBenchmarkPrice, uint256 tokenOutBenchmarkPrice, address router, bytes32 routeTag, string apiKeyId, bool success, string reason)";

const getSwapExecutedLogs = async (options: FetchOptions, swapShell: string) => {
  const fromBlock = await options.getFromBlock();
  const toBlock = await options.getToBlock();
  const requests: Promise<any[]>[] = [];

  if (fromBlock < SWAP_EXECUTED_V2_BLOCK) {
    requests.push(options.getLogs({
      target: swapShell,
      eventAbi: SWAP_EXECUTED_V1,
      fromBlock,
      toBlock: Math.min(toBlock, SWAP_EXECUTED_V2_BLOCK - 1),
    }));
  }
  if (toBlock >= SWAP_EXECUTED_V2_BLOCK) {
    requests.push(options.getLogs({
      target: swapShell,
      eventAbi: SWAP_EXECUTED_V2,
      fromBlock: Math.max(fromBlock, SWAP_EXECUTED_V2_BLOCK),
      toBlock,
    }));
  }

  return (await Promise.all(requests)).flat();
};

const fetch = async (options: FetchOptions) => {
  const { swapShell } = chainConfig[options.chain];
  const dailyVolume = options.createBalances();
  const logs = await getSwapExecutedLogs(options, swapShell);

  logs.forEach((log) => {
    if (!log.success) return;
    dailyVolume.add(log.tokenIn, log.amountIn);
  });

  return { dailyVolume, };
};

const methodology = {
  Volume: "Total daily trading volume from successful swaps on arcus aggregator.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  start: "2026-07-01",
  methodology,
};

export default adapter;
