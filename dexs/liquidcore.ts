import { FetchOptions, FetchResult, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const SwapEvent = "event Swap(address indexed user, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 fee, uint256 reserve0, uint256 reserve1)";

const LIQUIDCORE_ROUTER = "0x625aC1D165c776121A52ff158e76e3544B4a0b8B";
const LIQUIDCORE_POOLS = [
  "0xA7478A5ff7cB27A8008D6D90785db10223bc6087",
  "0xD3994A6CF46cA91536376f89aCDadf92eD289a9F"
];
const ROUTER_DEPLOYED_DATE = "2026-03-03";

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  // Fetch all pools from the router
  const pools = options.dateString <= ROUTER_DEPLOYED_DATE ? LIQUIDCORE_POOLS : await options.api.call({
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

