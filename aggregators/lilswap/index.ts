import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { lilswapChainAliases, lilswapSupportedChains } from "../../helpers/lilswapConfig";
import { fetchLilSwapDailyMetrics, getLilSwapVolume } from "../../helpers/lilswap";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {},
  methodology: {
    Volume: "Counts the USD notional of confirmed LilSwap transactions from LilSwap's public metrics endpoint, including zero-fee swaps.",
  },
};

lilswapSupportedChains.forEach((chain) => {
  adapter.adapter![chain] = {
    start: "2025-01-01",
    fetch: async (options: FetchOptions) => {
      const row = await fetchLilSwapDailyMetrics(options, lilswapChainAliases);

      return {
        dailyVolume: getLilSwapVolume(row),
      };
    },
  };
});

export default adapter;
