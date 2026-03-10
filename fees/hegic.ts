import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

import {
  fetchArbitrumAnalyticsData,
  getEarliestAvailableTimestamp,
} from "../options/hegic";

const OPTIONS_PREMIUMS = 'Options premiums';

const adapter: Adapter = {
  methodology: {
    Fees: 'All premiums fees paid by users while trading on Hegic.',
    Revenue: 'All the fees are revenue',
  },
  breakdownMethodology: {
    Fees: {
      [OPTIONS_PREMIUMS]: 'Premium fees paid by users to purchase options contracts (calls, puts, and option strategies like straddles, strangles, spreads, condors, and butterflies)',
    },
    Revenue: {
      [OPTIONS_PREMIUMS]: 'Premium fees paid by users to purchase options contracts (calls, puts, and option strategies like straddles, strangles, spreads, condors, and butterflies)',
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
  timestamp: number,
  _: any,
  options: FetchOptions,
) {
  const optionsDashboardData = await fetchArbitrumAnalyticsData(timestamp);

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(Number(optionsDashboardData.dailyPremiumVolume), OPTIONS_PREMIUMS);

  return {
    timestamp,
    dailyFees,
    dailyRevenue: dailyFees,
  };
}

export default adapter;
