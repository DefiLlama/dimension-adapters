import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchLilSwapDailyMetrics, getLilSwapVolume } from "../../helpers/lilswap";

const supportedChains = [
  CHAIN.ETHEREUM,
  CHAIN.BSC,
  CHAIN.POLYGON,
  CHAIN.BASE,
  CHAIN.ARBITRUM,
  CHAIN.AVAX,
  CHAIN.OPTIMISM,
  CHAIN.XDAI,
  CHAIN.SONIC,
];

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {},
  methodology: {
    Volume: "Counts the USD notional of confirmed LilSwap transactions from LilSwap's public metrics endpoint, including zero-fee swaps.",
  },
};

supportedChains.forEach((chain) => {
  adapter.adapter![chain] = {
    start: "2025-01-01",
    fetch: async (options: FetchOptions) => {
      const row = await fetchLilSwapDailyMetrics(options);

      return {
        dailyVolume: getLilSwapVolume(row),
      };
    },
  };
});

export default adapter;
