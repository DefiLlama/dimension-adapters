import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import {
  fetchFiboDailyMetrics,
  FIBO_USDC,
} from "../helpers/fibo";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const data = await fetchFiboDailyMetrics(options);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.add(FIBO_USDC, data.dailyFeesUsdc, "Protocol fees");
  dailyRevenue.add(FIBO_USDC, data.dailyRevenueUsdc, "Protocol revenue");
  dailyProtocolRevenue.add(
    FIBO_USDC,
    data.dailyProtocolRevenueUsdc,
    "Treasury revenue",
  );
  dailySupplySideRevenue.add(
    FIBO_USDC,
    data.dailySupplySideRevenueUsdc ?? "0",
    "Supply side",
  );

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: "Protocol fee accruals on settled FIBO parimutuel rounds (treasury_flows fee_accrual via api.fibo.fun).",
    Revenue: "Fees retained by protocol treasury (100% of fees).",
    ProtocolRevenue: "All fee revenue to treasury.",
    SupplySideRevenue:
      "None — winners are paid from the parimutuel pool, not a separate supply-side fee share.",
  },
  breakdownMethodology: {
    Fees: {
      "Protocol fees":
        "Indexed fee_accrual events from ryze-api Elasticsearch (GET /api/pulse/defillama/daily)",
    },
    Revenue: {
      "Protocol revenue": "Same as fees; no supply-side fee split",
    },
    ProtocolRevenue: {
      "Treasury revenue": "100% of protocol fees",
    },
    SupplySideRevenue: {
      "Supply side": "Zero",
    },
  },
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: "2026-06-16",
    },
  },
};

export default adapter;
