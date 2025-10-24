import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const TransformedERC20Event =
  "event TransformedERC20(address indexed taker, address inputToken, address outputToken, uint256 inputTokenAmount, uint256 outputTokenAmount)";

const HYPERBLOOM_ADDRESSES = [
  "0x4212a77e4533eca49643d7b731f5fb1b2782fe94", //new
  "0x74cddb25b3f230200b28d79ce85c43991648954a", //old
];

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const logs: any[] = await options.getLogs({
    targets: HYPERBLOOM_ADDRESSES,
    eventAbi: TransformedERC20Event,
  });

  logs.forEach((log: any) => {
    const amount = (log.outputTokenAmount * 25n) / 100000n; // 0.025%
    dailyFees.add(log.outputToken, amount);
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  methodology: {
    Fees: "0.025% trading fees on all trades",
    Revenue: "0.025% per trade revenue",
    ProtocolRevenue: "0.025% per trade revenuee",
  },
  version: 2,
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch,
      start: "2025-05-31",
    },
  },
  isExpensiveAdapter: true,
};

export default adapter;