import { FetchOptions, SimpleAdapter } from "../adapters/types";
import {
  allbridgeNextChainConfig,
  getAllbridgeNextDailyStats,
  prefetchAllbridgeNextDailyStats,
} from "../helpers/aggregators/allbridge-next";

const ALLBRIDGE_FEES = "Allbridge Fees";

const fetch = async (options: FetchOptions) => {
  const { feesUsd } = getAllbridgeNextDailyStats(options);
  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(feesUsd, ALLBRIDGE_FEES);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 1, // the stats API only returns daily aggregates
  fetch,
  prefetch: prefetchAllbridgeNextDailyStats,
  adapter: allbridgeNextChainConfig,
  methodology: {
    Fees: "Allbridge fee (a share of the transfer amount) paid by users on top of the settlement quote of every Allbridge Next transfer, in USD as reported by the Allbridge Next stats API.",
    Revenue: "All fees go to Allbridge.",
    ProtocolRevenue: "All fees go to Allbridge.",
  },
  breakdownMethodology: {
    Fees: {
      [ALLBRIDGE_FEES]: "Allbridge fee charged on each transfer as a share of the transfer amount.",
    },
    Revenue: {
      [ALLBRIDGE_FEES]: "Allbridge fees are kept by Allbridge.",
    },
    ProtocolRevenue: {
      [ALLBRIDGE_FEES]: "Allbridge fees are kept by Allbridge.",
    },
  },
};

export default adapter;
