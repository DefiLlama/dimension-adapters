import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchBuilderCodeRevenue } from "../helpers/hyperliquid";

// HypurrTrade builder address on Hyperliquid mainnet (0.05% builder fee)
const HL_BUILDER_ADDRESS = "0x0e024A4faD828e8f976fdCcbEEaAb72d4205be3c";

const fetch = async (options: FetchOptions) => {
  const { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue } =
    await fetchBuilderCodeRevenue({ options, builder_address: HL_BUILDER_ADDRESS });
  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue };
};

const methodology = {
  Volume: "Perps trading volume routed through the HypurrTrade terminal on Hyperliquid.",
  Fees: "Builder fees (0.05%) paid by users on perps trades routed through HypurrTrade.",
  Revenue: "Builder fees collected by HypurrTrade from Hyperliquid perps trades.",
  ProtocolRevenue: "Builder fees collected by HypurrTrade from Hyperliquid perps trades.",
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.HYPERLIQUID]: { fetch, start: "2026-09-18" },
  },
  methodology,
  doublecounted: true,
};

export default adapter;
