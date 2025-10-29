import { CHAIN } from "../../helpers/chains";
import { fetchBuilderCodeRevenue } from "../../helpers/hyperliquid";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";

const HL_BUILDER_ADDRESS = "0xa58d3d31f09d75bd92ae2ef277e785b2ebb83b77";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue } =
    await fetchBuilderCodeRevenue({
      options,
      builder_address: HL_BUILDER_ADDRESS,
    });
  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
  };
};

const methodology = {
  Fees: "0.01% per trade, plus separate fees from Hyperliquid.",
  Revenue: "Portion of fees collected by XTrade",
  ProtocolRevenue: "Portion of fees collected by XTrade",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  methodology,
  chains: [CHAIN.HYPERLIQUID],
  start: "2025-05-05",
  isExpensiveAdapter: true,
};

export default adapter;
