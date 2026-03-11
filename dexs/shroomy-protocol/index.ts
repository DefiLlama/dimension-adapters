import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const TransformedERC20Event = "event TransformedERC20(address indexed taker, address inputToken, address outputToken, uint256 inputTokenAmount, uint256 outputTokenAmount)";

const SHROOMY_AGGREGATOR_ADDRESS = "0x6cAcD722b95C1a5D055a3A45932C42246060132e"

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const logs: any[] = await options.getLogs({
    targets: [SHROOMY_AGGREGATOR_ADDRESS],
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
  pullHourly: true,
  fetch,
  start: "2025-09-15",
  methodology: {
    Volume: "Total trading swap volume via Shroomy Protocol.",
    Fees: "Flat 0.05% amount of trading swap fees on all trades.",
    Revenue: "Flat 0.05% amount of trading swap fees on all trades are revenue.",
    ProtocolRevenue: "Flat 0.05% amount of trading swap fees on all trades are revenue.",
  },
  chains: [CHAIN.INK],
};

export default adapter;
