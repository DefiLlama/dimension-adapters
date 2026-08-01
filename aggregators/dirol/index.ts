import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const CORE_AGGREGATORS = [
  "0x77E73c3fCd3FEDba383025CDe4a5b97733A34c2E", // v1 (deprecated 2025-12-05 ~ 2026-02-27)
  "0x646462f4d0168A94fE1884c8ae82148a3618A18d", // v2 UUPS proxy (current)
];

const SWAP_EVENT = "event Swap(address indexed sender, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const logs = await options.getLogs({
    targets: CORE_AGGREGATORS,
    eventAbi: SWAP_EVENT,
  });

  logs.forEach((log) => {
    dailyVolume.add(log.tokenIn, log.amountIn);
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
