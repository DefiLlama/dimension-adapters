import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import {
  chainConfig,
  fetchHouseOfJoshiMetrics,
  PROTOCOL_REVENUE_LABEL,
  SWAP_FEE_LABEL,
} from "../../helpers/aggregators/house-of-joshi-swap";

const fetch = async (options: FetchOptions) => {
  const { dailyFees, dailyRevenue, dailyUserFees } = await fetchHouseOfJoshiMetrics(options);
  return {
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: chainConfig,
  fetch,
  methodology: {
    Fees: "The 1% House fee paid by users on swaps executed through HojswapRouterV2, using the exact feeAmount emitted for each trade.",
    Revenue: "All House swap fees are retained by the protocol; there is no supply-side fee allocation.",
    ProtocolRevenue: "Same as Revenue: the full House swap fee sent to the configured House wallet.",
  },
  breakdownMethodology: {
    Fees: {
      [SWAP_FEE_LABEL]: "The feeAmount emitted by HojswapRouterV2 for each completed swap.",
    },
    Revenue: {
      [PROTOCOL_REVENUE_LABEL]: "The full House fee sent to the protocol's configured House wallet.",
    },
    ProtocolRevenue: {
      [PROTOCOL_REVENUE_LABEL]: "The full House fee retained by the protocol.",
    },
  },
};

export default adapter;
