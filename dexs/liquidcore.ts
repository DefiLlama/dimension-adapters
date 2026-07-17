import { ChainApi } from "@defillama/sdk";
import { FetchOptions, FetchResult, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const SwapEvent = "event Swap(address indexed user, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 fee, uint256 reserve0, uint256 reserve1)";
const SwapWithRefEvent = "event SwapWithRef(address indexed user, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 fee, bytes32 indexed refCode, uint256 refFee, uint256 reserve0, uint256 reserve1)";

const chainConfig: Record<string, { start: string, address: string }> = {
  [CHAIN.HYPERLIQUID]: {
    start: "2026-03-03",
    address: "0x625aC1D165c776121A52ff158e76e3544B4a0b8B",
  },
  [CHAIN.ROBINHOOD]: {
    start: "2026-07-14",
    address: "0x322F277BfB7Ba9c196194ad18011377A0fF55Fb3",
  },
};

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // query pools at latest block so backfills before router deployment still work
  const pools = await new ChainApi({ chain: options.chain }).call({
    target: chainConfig[options.chain].address,
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
  fetch,
  adapter: chainConfig,
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
