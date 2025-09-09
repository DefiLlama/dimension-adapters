import { Adapter, FetchOptions, FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  const { daily } = await fetchURL(
    `https://beta.strikefinance.org/api/analytics/fees?from=${options.startTimestamp}&to=${options.endTimestamp}`
  );

  dailyFees.addCGToken("cardano", Number(daily.totalFeesByAsset.ADA));
  dailyRevenue.addCGToken("cardano", Number(daily.totalRevenueByAsset.ADA));
  dailyFees.addCGToken("snek", Number(daily.totalFeesByAsset.SNEK));
  dailyRevenue.addCGToken("snek", Number(daily.totalRevenueByAsset.SNEK));

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
    },
  },
  allowNegativeValue: true, // bad liquidation
  methodology: {
    Fees: "All trading fees associated with opening a perpetual position.",
    Revenue: "All open fees plus liquidation and trading revenue.",
    ProtocolRevenue:
      "All open fees plus liquidation and trading revenue.",
  },
};

export default adapter;
