import { CHAIN } from "../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { fetchBuilderCodeRevenue } from "../helpers/hyperliquid";

const PERPMATE_BUILDER_ADDRESS = "0xe4fea748eca48f44b1e042775f0c2363be1a2d80";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue } =
    await fetchBuilderCodeRevenue({
      options,
      builder_address: PERPMATE_BUILDER_ADDRESS,
    });

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
  };
};

const methodology = {
  Fees: "builder code revenue from Hyperliquid Perps Trades.",
  Revenue: "builder code revenue from Hyperliquid Perps Trades.",
  ProtocolRevenue: "builder code revenue from Hyperliquid Perps Trades.",
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: "2025-09-04",
  methodology,
  doublecounted: true,
};

export default adapter;
