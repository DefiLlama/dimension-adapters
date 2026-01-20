import { CHAIN } from "../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { fetchBuilderCodeRevenue } from "../helpers/hyperliquid";

const BASED_APP_BUILDER_ADD = "0x1924b8561eef20e70ede628a296175d358be80e5";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue } =
    await fetchBuilderCodeRevenue({
      options,
      builder_address: BASED_APP_BUILDER_ADD,
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
  start: "2025-07-08",
  methodology,
  doublecounted: true,
};

export default adapter;
