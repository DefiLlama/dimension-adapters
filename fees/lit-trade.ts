import { CHAIN } from "../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { fetchBuilderCodeRevenue } from "../helpers/hyperliquid";

const LIT_APP_BUILDER_ADD = "0x24a747628494231347f4f6aead2ec14f50bcc8b7";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue } =
    await fetchBuilderCodeRevenue({
      options,
      builder_address: LIT_APP_BUILDER_ADD,
    });

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
  };
};

const methodology = {
  Fees: "Builder code revenue from Hyperliquid Perps Trades.",
  Revenue: "Builder code revenue from Hyperliquid Perps Trades.",
  ProtocolRevenue: "Builder code revenue from Hyperliquid Perps Trades.",
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: "2025-08-01",
  methodology,
  doublecounted: true,
  isExpensiveAdapter: true,
};

export default adapter;
