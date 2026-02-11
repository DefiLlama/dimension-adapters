import { CHAIN } from "../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { fetchBuilderCodeRevenue } from "../helpers/hyperliquid";

const DEXLY_TRADE_APP_BUILDER_ADD = "0x22047776933bC123D0602ed17aaF0D2f5647DF0C";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue } =
    await fetchBuilderCodeRevenue({
      options,
      builder_address: DEXLY_TRADE_APP_BUILDER_ADD,
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
  start: "2026-02-01",
  methodology,
  doublecounted: true,
};

export default adapter;
