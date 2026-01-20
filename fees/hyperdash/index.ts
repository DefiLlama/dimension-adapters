import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { fetchBuilderCodeRevenue } from "../../helpers/hyperliquid";

const HYPERDASH_BUILDER_ADDRESS = "0xe966a12bf7b93838096e4519a684519ab22df618";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue } =
    await fetchBuilderCodeRevenue({
      options,
      builder_address: HYPERDASH_BUILDER_ADDRESS,
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
  start: "2025-01-05",
  methodology,
  doublecounted: true,
};

export default adapter;
