import { CHAIN } from "../helpers/chains";
import { fetchBuilderCodeRevenue } from "../helpers/hyperliquid";
import { FetchOptions, SimpleAdapter } from "../adapters/types";

const HL_BUILDER_ADDRESS = "0xde579b19e57fa3e83305ebb50033b25c7f6ea2e8";

const fetchHyperliquid = async (options: FetchOptions) => {
  const { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue } =
    await fetchBuilderCodeRevenue({
      options,
      builder_address: HL_BUILDER_ADDRESS,
    });
  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue };
};

const methodology = {
  Fees: "Trading fees paid by users when executing perps through the Trending interface on Hyperliquid.",
  Revenue: "Builder fees collected by Trending for trades executed through its non-custodial interface.",
  ProtocolRevenue: "Builder fees collected by Trending for trades executed through its non-custodial interface.",
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch: fetchHyperliquid,
      start: "2026-07-21",
    },
  },
  methodology,
  doublecounted: true,
};

export default adapter;
