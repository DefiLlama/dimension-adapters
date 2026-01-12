import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const TransformedERC20Event = "event TransformedERC20(address indexed taker, address inputToken, address outputToken, uint256 inputTokenAmount, uint256 outputTokenAmount)";

const TEPHRA_AGGREGATOR = "0xde3102F480dE10385680DCBaFA1834945a63273E"

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const logs: any[] = await options.getLogs({
    targets: [TEPHRA_AGGREGATOR],
    eventAbi: TransformedERC20Event,
    flatten: true,
  });

  for (const log of logs) {
    dailyVolume.add(log.inputToken, log.inputTokenAmount);
    dailyFees.add(log.inputToken, Number(log.inputTokenAmount) * 0.0005); // 0.05%
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
  start: "2025-12-09",
  methodology: {
    Volume: "Total trading volume aggregated via Tephra routers.",
    Fees: "Flat 0.05% amount of trading fees on all trades.",
    Revenue: "Flat 0.05% amount of trading fees on all trades are revenue.",
    ProtocolRevenue: "Flat 0.05% amount of trading fees on all trades are revenue.",
  },
  chains: [CHAIN.INK],
};

export default adapter;