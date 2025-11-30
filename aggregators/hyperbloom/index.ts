import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const TransformedERC20Event = "event TransformedERC20(address indexed taker, address inputToken, address outputToken, uint256 inputTokenAmount, uint256 outputTokenAmount)";

const HYPERBLOOM_ADDRESSES = [
  "0x4212a77e4533eca49643d7b731f5fb1b2782fe94", // new
  "0x74cddb25b3f230200b28d79ce85c43991648954a", // old
];

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const logs: any[] = await options.getLogs({
    targets: HYPERBLOOM_ADDRESSES,
    eventAbi: TransformedERC20Event,
    flatten: true,
  });

  for (const log of logs) {
    dailyVolume.add(log.inputToken, log.inputTokenAmount);
    dailyFees.add(log.inputToken, Number(log.inputTokenAmount) * 0.00025); // 0.025%
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
   };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  start: "2025-05-31",
  methodology: {
    Volume: "Total trading volume aggregated via Hyperbloom routers.",
    Fees: "Flat 0.025% amount of  trading fees on all trades.",
    Revenue: "Flat 0.025% amount of  trading fees on all trades are revenue.",
    ProtocolRevenue: "Flat 0.025% amount of  trading fees on all trades are revenue.",
  },
  chains: [CHAIN.HYPERLIQUID],
};

export default adapter;