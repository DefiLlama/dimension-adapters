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
        methodology: `
The only thing anyone pays on Hegic is premiums. This goes into dailyFees.

The paid premiums can be considered Revenue, but at the moment we don't include it in the dashboard, because:

- payout is epoch-based (30 days), not daily
- stakers get all premiums minus profits of traders (!!!), so in fact stakers may get a negative payout (slashed stake)

Hegic Development fund also stakes ~170M Hegic tokens (16% of supply), so that could be considered ProtocolRevenue
  `,
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
