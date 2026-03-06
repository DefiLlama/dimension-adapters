import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const CORE_AGGREGATOR = "0x77E73c3fCd3FEDba383025CDe4a5b97733A34c2E";

const SWAP_EVENT = "event Swap(address indexed sender, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const logs = await options.getLogs({
    target: CORE_AGGREGATOR,
    eventAbi: SWAP_EVENT,
  });

  logs.forEach((log) => {
    const tokenIn = log.tokenIn;
    const amountIn = log.amountIn;

    // Handle native token (address(0)) too
    dailyVolume.add(tokenIn, amountIn);
  });

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology: {
    Volume: "Sum of amountIn from Swap events emitted by CORE_AGGREGATOR (tokenIn side).",
  },
  adapter: {
    [CHAIN.MONAD]: {
      fetch,
      start: "2025-12-05",
    },
  },
};

export default adapter;
