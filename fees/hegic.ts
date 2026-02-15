import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

import {
  fetchArbitrumAnalyticsData,
  getEarliestAvailableTimestamp,
} from "../options/hegic";

const adapter: Adapter = {
  methodology: {
    Fees: 'All premiums fees paid by users while trading on Hegic.',
  },
  breakdownMethodology: {
    Fees: {
      'Options premiums': 'Premium fees paid by users to purchase options contracts (calls, puts, and option strategies like straddles, strangles, spreads, condors, and butterflies)',
    },
  },
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: getHegicFees,
      start: getEarliestAvailableTimestamp,
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
