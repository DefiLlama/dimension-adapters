import { FetchOptions, FetchResult, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const SwapEvent = "event Swap(address indexed user, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 fee, uint256 reserve0, uint256 reserve1)";

const LIQUIDCORE_ROUTER = "0x625aC1D165c776121A52ff158e76e3544B4a0b8B";

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  // Fetch all pools from the router
  const pools = await options.api.call({
    target: LIQUIDCORE_ROUTER,
    abi: "function getPools() external view returns (address[])",
  });
  
  const logs = await options.getLogs({
    targets: pools,
    eventAbi: SwapEvent,
    flatten: true,
  })

  for (const log of logs) {
    // Track volume using the input token amount
    dailyVolume.add(log.tokenIn, log.amountIn);
    
    // Track fees (all fees go to protocol revenue)
    dailyFees.add(log.tokenOut, log.fee);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Volume: "Volume is calculated from the amountIn of all Swap events on LiquidCore pools.",
  Fees: "All swap fees collected by LiquidCore pools.",
  Revenue: "All swap fees go to protocol revenue (100% protocol-owned liquidity).",
  ProtocolRevenue: "All swap fees go to protocol revenue (100% protocol-owned liquidity).",
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch,
      start: "2025-08-11",
    },
  },
};

export default adapter;

