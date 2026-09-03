import { FetchOptions, SimpleAdapter } from "../adapters/types";
import {
  ALLBRIDGE_NEXT_CHAINS,
  ALLBRIDGE_NEXT_START,
  getAllbridgeNextDailyStats,
  prefetchAllbridgeNextDailyStats,
} from "../helpers/aggregators/allbridge-next";

const fetch = async (options: FetchOptions) => {
  const { feesUsd } = getAllbridgeNextDailyStats(options);
  return {
    dailyFees: feesUsd,
    dailyUserFees: feesUsd,
    dailyRevenue: feesUsd,
    dailyProtocolRevenue: feesUsd,
  };
};

const adapter: SimpleAdapter = {
  version: 1, // the stats API only returns daily aggregates
  fetch,
  prefetch: prefetchAllbridgeNextDailyStats,
  chains: Object.keys(ALLBRIDGE_NEXT_CHAINS),
  start: ALLBRIDGE_NEXT_START,
  methodology: {
    Fees: "Allbridge fee (a share of the transfer amount) charged on top of the settlement quote of every Allbridge Next transfer, in USD as reported by the Allbridge Next stats API.",
    UserFees: "All fees are paid by the users sending transfers.",
    Revenue: "All fees go to Allbridge.",
    ProtocolRevenue: "All fees go to Allbridge.",
  },
};

export default adapter;
