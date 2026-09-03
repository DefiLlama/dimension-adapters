import { FetchOptions, SimpleAdapter } from "../adapters/types";
import {
  allbridgeNextChainConfig,
  getAllbridgeNextDailyStats,
  prefetchAllbridgeNextDailyStats,
} from "../helpers/aggregators/allbridge-next";

const ALLBRIDGE_FEES = "Allbridge Fees";

// `feesUsd` is only Allbridge's own fee: the stats API sums the fee that Allbridge attaches to each transfer
// (a fixed share of the transfer amount, paid to Allbridge's fee account). Settlement provider and relayer
// costs are part of the quoted rate, not part of this fee, so there is no supply-side revenue to report.
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
    Fees: "Allbridge fee (a fixed share of the transfer amount) paid by users on top of the settlement quote of every Allbridge Next transfer, in USD as reported by the Allbridge Next stats API. Settlement provider and relayer costs are part of the quoted rate and are not included.",
    Revenue: "All Allbridge fees go to Allbridge.",
    ProtocolRevenue: "All Allbridge fees go to Allbridge.",
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
