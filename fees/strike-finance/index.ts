import { Adapter, FetchOptions, FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  const { totalFees, totalRevenue } = await fetchURL(
    `https://beta.strikefinance.org/api/analytics/fees?from=${options.startTimestamp}&to=${options.endTimestamp}`
  );

  dailyFees.addCGToken("cardano", Number(totalFees));
  dailyRevenue.addCGToken("cardano", Number(totalRevenue));

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.CARDANO]: {
      fetch,
      start: "2025-05-16",
      meta: {
        methodology: {
          Fees: "All trading fees associated with opening a perpetual position.",
          Revenue: "All open fees plus liquidation and trading revenue.",
          ProtocolRevenue: "All open fees plus liquidation and trading revenue.",
        }
      }
    },
  },
  allowNegativeValue: true, // bad liquidation
};

export default adapter;
