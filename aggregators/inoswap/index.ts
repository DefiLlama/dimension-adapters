import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const ROUTERS = [
  "0x025f45a3ec6e90e8e1db1492554c9b10539ef2fc", // current
  "0x95E8f3227eCc2F35213B6fD6fEce6B8854A77dB5", // legacy
];

const SWAP_EXECUTED_EVENT =
  "event SwapExecuted(address indexed user, address indexed router, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 fee, uint256 actualSlippage, uint8 swapType)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const swapLogs = await options.getLogs({
    targets: ROUTERS,
    eventAbi: SWAP_EXECUTED_EVENT,
  });

  for (const log of swapLogs) {
    dailyVolume.add(log.tokenIn, log.amountIn);
  }

  return { dailyVolume };
};

const adapter: any = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.CRONOS]: {
      fetch,
      start: "2026-02-01",
    },
  },
};

export default adapter;
