import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import {
  chainConfig,
  fetchHouseOfJoshiMetrics,
  VOLUME_LABEL,
} from "../../helpers/aggregators/house-of-joshi-swap";

const fetch = async (options: FetchOptions) => {
  const { dailyVolume } = await fetchHouseOfJoshiMetrics(options);
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: chainConfig,
  fetch,
  methodology: {
    Volume: "Gross sell-token amounts routed through HojswapRouterV2, read from its SwapExecuted events. Underlying DEX volume is not attributed as House of Joshi liquidity.",
  },
  breakdownMethodology: {
    Volume: {
      [VOLUME_LABEL]: "Gross sell-token amounts emitted by HojswapRouterV2 for completed swaps.",
    },
  },
};

export default adapter;
