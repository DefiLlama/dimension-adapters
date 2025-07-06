import axios from "axios";
import { Adapter, FetchOptions, FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const {
    data: { totalFees, totalRevenue },
  } = await axios.get(
    `https://beta.strikefinance.org/api/analytics/fees?from=${options.startTimestamp}&to=${options.endTimestamp}`
  );
  const dailyFeesUSD = options.createBalances();
  const dailyRevenueUSD = options.createBalances();
  dailyFeesUSD.addCGToken("cardano", Number(totalFees));
  dailyRevenueUSD.addCGToken("cardano", Number(totalRevenue));
  return {
    timestamp: options.startOfDay,
    dailyFees: dailyFeesUSD,
    dailyRevenue: dailyRevenueUSD,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.CARDANO]: {
      fetch,
      start: "2024-05-16",
      runAtCurrTime: true,
      meta: {
        methodology: {
          Fees: "All trading fees associated with opening a perpetual position.",
          Revenue: "All open fees plus liquidation and trading revenue",
        }
      }
    },
  },
  allowNegativeValue: true,
};

export default adapter;
