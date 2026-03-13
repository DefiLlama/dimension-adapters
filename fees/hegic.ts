import { Adapter, FetchOptions, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

import {
  getEarliestAvailableTimestamp,
  analyticsEndpoint
} from "../options/hegic";
import fetchURL from "../utils/fetchURL";

interface HegicPosition {
  isActive: boolean;
  closeDate: string | null;
  premiumPaid: number;
  payOff: number;
}

const adapter: Adapter = {
  methodology: {
    Fees: 'All premiums paid by users to purchase options and strategies on Hegic.',
    SupplySideRevenue: 'Payoffs paid out to options holders who exercised their contracts.',
    Revenue: 'Net premiums retained by the Hegic Stake & Cover pool (premiums minus payoffs).',
    HoldersRevenue: '100% of net premiums distributed pro-rata to HEGIC Stake & Cover pool participants.',
  },
  breakdownMethodology: {
    Fees: {
      'Options premiums': 'Premium fees paid by users to purchase options contracts (calls, puts, and option strategies like straddles, strangles, spreads, condors, and butterflies)',
    },
    SupplySideRevenue: {
      'Options payoffs': 'Payoffs paid out to options holders who exercised their contracts.',
    },
    Revenue: {
      'Options premiums': 'Net premiums retained by the Hegic Stake & Cover pool after paying out exercised options.',
    },
    HoldersRevenue: {
      'Options premiums': '100% of net premiums distributed to HEGIC Stake & Cover pool participants.',

    },
  },
  allowNegativeValue: true, // payoffs can exceed premiums paid
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: getHegicFees,
      start: getEarliestAvailableTimestamp,
    },
  },
};

function dateStringToTimestamp(dateString: string) {
  return new Date(dateString).getTime() / 1000;
}

async function getHegicFees(_: any, _1: any, options: FetchOptions): Promise<FetchResultFees> {
  const dailyFees = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const data = await fetchURL(analyticsEndpoint)
  const dayData = data.positions.filter((position: HegicPosition) => {
    if (!position.closeDate) return false
    const closeDate = dateStringToTimestamp(position.closeDate)
    return !position.isActive && closeDate >= options.startTimestamp && closeDate <= options.endTimestamp
  })
  dailyFees.addUSDValue(dayData.reduce((acc: number, position: HegicPosition) => acc + Number(position.premiumPaid), 0), "Options premiums")
  dailySupplySideRevenue.addUSDValue(dayData.reduce((acc: number, position: HegicPosition) => acc + Number(position.payOff), 0), "Options payoffs")
  const dailyRevenue = dailyFees.clone()
  dailyRevenue.subtract(dailySupplySideRevenue, "Options premiums")

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyHoldersRevenue: dailyRevenue
  };
}

export default adapter;
