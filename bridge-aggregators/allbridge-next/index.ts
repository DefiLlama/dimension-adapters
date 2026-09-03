import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import {
  ALLBRIDGE_NEXT_CHAINS,
  ALLBRIDGE_NEXT_START,
  getAllbridgeNextDailyStats,
  prefetchAllbridgeNextDailyStats,
} from "../../helpers/aggregators/allbridge-next";

const fetch = async (options: FetchOptions) => {
  const { volumeUsd } = getAllbridgeNextDailyStats(options);
  return { dailyBridgeVolume: volumeUsd };
};

const adapter: SimpleAdapter = {
  version: 1, // the stats API only returns daily aggregates
  fetch,
  prefetch: prefetchAllbridgeNextDailyStats,
  chains: Object.keys(ALLBRIDGE_NEXT_CHAINS),
  start: ALLBRIDGE_NEXT_START,
  methodology: {
    BridgeVolume: "USD value of successful cross-chain transfers initiated on the chain through Allbridge Next, as reported by the Allbridge Next stats API from transfers indexed on-chain by Allbridge.",
  },
};

export default adapter;
