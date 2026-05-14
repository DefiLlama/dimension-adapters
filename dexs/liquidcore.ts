import { FetchOptions, FetchResult, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const SwapEvent = "event Swap(address indexed user, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 fee, uint256 reserve0, uint256 reserve1)";
const SwapWithRefEvent = "event SwapWithRef(address indexed user, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 fee, bytes32 indexed refCode, uint256 refFee, uint256 reserve0, uint256 reserve1)";

const LIQUIDCORE_ROUTER = "0x625aC1D165c776121A52ff158e76e3544B4a0b8B";

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const pools: string[] = await options.api.call({
    target: LIQUIDCORE_ROUTER,
    abi: "function getPools() external view returns (address[])",
  });

  const [swapLogs, swapWithRefLogs] = await Promise.all([
    options.getLogs({ targets: pools, eventAbi: SwapEvent, flatten: true }),
    options.getLogs({ targets: pools, eventAbi: SwapWithRefEvent, flatten: true }),
  ]);

  for (const log of swapLogs) {
    dailyVolume.add(log.tokenIn, log.amountIn);
    dailyFees.add(log.tokenOut, log.fee);
  }

  for (const log of swapWithRefLogs) {
    dailyVolume.add(log.tokenIn, log.amountIn);
    dailyFees.add(log.tokenOut, log.fee);
    dailyFees.add(log.tokenOut, log.refFee);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Volume: "Volume is calculated from the amountIn of all Swap and SwapWithRef events on LiquidCore pools.",
  Fees: "All swap fees collected by LiquidCore pools.",
  Revenue: "All swap fees go to protocol revenue (100% protocol-owned liquidity).",
  ProtocolRevenue: "All swap fees go to protocol revenue (100% protocol-owned liquidity).",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology,
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch,
      start: "2025-08-11",
    },
  },
};

export default adapter;

