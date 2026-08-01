import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const fetch = async (options: FetchOptions) => {
  const data = await fetchURL(
    `https://app.strikefinance.org/api/analytics/fees?from=${options.startTimestamp}&to=${options.endTimestamp}`
  );

  const dailyFees = options.createBalances()

  dailyFees.addUSDValue(data.totalFees, 'Trading Fees');
  
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyHoldersRevenue: dailyFees,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.CARDANO]: {
      fetch,
      start: "2025-05-16",
    },
  },
  allowNegativeValue: true,
  methodology: {
    Fees: "All trading fees collected by the platform.",
    Revenue: "All trading fees collected by the platform.",
    HoldersRevenue: "100% of all trading fees collected by the platform goes to $STRIKE holders.",
  },
  breakdownMethodology: {
    Fees: {
      "Trading Fees": "Fees collected from trades executed on the Strike Finance.",
    },
    Revenue: {
      "Trading Fees": "Fees collected from trades executed on the Strike Finance.",
    },
    HoldersRevenue: {
      "Trading Fees": "100% of all trading fees collected by the platform goes to $STRIKE holders.",
    },
  },
};

export default adapter;
