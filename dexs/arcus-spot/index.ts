import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Source: Arcus app mainnet config, Robinhood Chain swap shell.
const chainConfig: Record<string, { start: string; swapShell: string }> = {
  [CHAIN.ROBINHOOD]: {
    start: "2026-06-11",
    swapShell: "0x4262efBd176F02824af27010bEa218429c33c7E8",
  },
};

//https://robinhoodchain.blockscout.com/tx/0x8d7b27b6ca8a4327287518271fcb1e915f1a65e17c5585bcec33a962b09af579?tab=logs
const SWAP_EXECUTED =
  "event SwapExecuted(address indexed taker, address indexed tokenIn, address indexed tokenOut, uint256 minAmountOut, uint256 amountIn, uint256 quotedAmountIn, uint256 quotedAmountOut, uint256 amountOut, uint256 tokenInBenchmarkPrice, uint256 tokenOutBenchmarkPrice, address router, bytes32 routeTag, bool success, string reason)";

const fetch = async (options: FetchOptions) => {
  const { swapShell } = chainConfig[options.chain];
  const dailyVolume = options.createBalances();
  const logs = await options.getLogs({ target: swapShell, eventAbi: SWAP_EXECUTED });

  logs.forEach((log) => {
    if (!log.success) return;
    dailyVolume.add(log.tokenIn, log.amountIn);
  });

  return { dailyVolume };
};

const methodology = {
  Volume: "Total daily trading volume from successful Arcus spot RFQ swaps.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology,
};

export default adapter;
