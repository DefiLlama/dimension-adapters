import { Adapter, FetchResultFees } from "../adapters/types";
import { ARBITRUM } from "../helpers/chains";

import {
  fetchArbitrumAnalyticsData,
  getEarliestAvailableTimestamp,
} from "../options/hegic";

const adapter: Adapter = {
  adapter: {
    [ARBITRUM]: {
      fetch: getHegicFees,
      start: getEarliestAvailableTimestamp,
      meta: {
        methodology: {
          Fees: 'All premiums fees paid by users while trading on Hegic.',
        },
      },
    },
  },
};

async function getHegicFees(
  /** Timestamp representing the end of the 24 hour period */
  timestamp: number
): Promise<FetchResultFees> {
  const optionsDashboardData = await fetchArbitrumAnalyticsData(timestamp);

  return {
    timestamp,
    dailyFees: optionsDashboardData.dailyPremiumVolume,
  };
}

export default adapter;
