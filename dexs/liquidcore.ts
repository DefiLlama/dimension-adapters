import { FetchOptions, FetchResult, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const SwapEvent = "event Swap(address indexed user, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 fee, uint256 reserve0, uint256 reserve1)";
const SwapWithRefEvent = "event SwapWithRef(address indexed user, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 fee, bytes32 indexed refCode, uint256 refFee, uint256 reserve0, uint256 reserve1)";

const LIQUIDCORE_ROUTERS: Record<string, string> = {
  [CHAIN.HYPERLIQUID]: "0x625aC1D165c776121A52ff158e76e3544B4a0b8B",
  [CHAIN.ROBINHOOD]: "0x322F277BfB7Ba9c196194ad18011377A0fF55Fb3",
};
const LIQUIDCORE_POOLS: Record<string, string[]> = {
  [CHAIN.HYPERLIQUID]: [
    "0xA7478A5ff7cB27A8008D6D90785db10223bc6087",
    "0xD3994A6CF46cA91536376f89aCDadf92eD289a9F"
  ],
  [CHAIN.ROBINHOOD]: [
    "0x31114060CB522097F4cF670b3cd95C254920668e"
  ],
};
const ROUTER_DEPLOYED_DATES: Record<string, string> = {
  [CHAIN.HYPERLIQUID]: "2026-03-03",
  [CHAIN.ROBINHOOD]: "2026-07-16",
};

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const usePoolsFallback = options.dateString <= ROUTER_DEPLOYED_DATES[options.chain];
  const pools = usePoolsFallback ? LIQUIDCORE_POOLS[options.chain] : await options.api.call({
    target: LIQUIDCORE_ROUTERS[options.chain],
    abi: "function getPools() external view returns (address[])",
  });

  const [swapLogs, swapWithRefLogs] = await Promise.all([
    options.getLogs({ targets: pools, eventAbi: SwapEvent, flatten: true }),
    options.getLogs({ targets: pools, eventAbi: SwapWithRefEvent, flatten: true }),
  ]);

  for (const log of swapLogs) {
    dailyVolume.add(log.tokenIn, log.amountIn);
    dailyFees.add(log.tokenOut, log.fee, METRIC.SWAP_FEES);
    dailyRevenue.add(log.tokenOut, log.fee, METRIC.SWAP_FEES);
  }

  for (const log of swapWithRefLogs) {
    dailyVolume.add(log.tokenIn, log.amountIn);
    dailyFees.add(log.tokenOut, log.fee, METRIC.SWAP_FEES);
    dailyFees.add(log.tokenOut, log.refFee, "Referral Fees");
    dailyRevenue.add(log.tokenOut, log.fee, METRIC.SWAP_FEES);
    dailySupplySideRevenue.add(log.tokenOut, log.refFee, "Referral Fees");
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue
  };
};

const methodology = {
  Volume: "Volume is calculated from the amountIn of all Swap and SwapWithRef events on LiquidCore pools.",
  Fees: "All swap fees collected by LiquidCore pools.",
  Revenue: "Swap fees that go to protocol revenue (100% protocol-owned liquidity).",
  ProtocolRevenue: "Swap fees that go to protocol revenue (100% protocol-owned liquidity).",
  SupplySideRevenue: "Referral fees paid to third-party referrers."
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
    [CHAIN.ROBINHOOD]: {
      fetch,
      start: "2026-07-14",
    },
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: "Swap fees collected by LiquidCore pools.",
      "Referral Fees": "Referral fees paid to third-party referrers."
    },
    Revenue: {
      [METRIC.SWAP_FEES]: "Swap fees that go to protocol revenue (100% protocol-owned liquidity)."
    },
    ProtocolRevenue: {
      [METRIC.SWAP_FEES]: "Swap fees that go to protocol revenue (100% protocol-owned liquidity)."
    },
    SupplySideRevenue: {
      "Referral Fees": "Referral fees paid to third-party referrers."
    },
  }
};

export default adapter;

