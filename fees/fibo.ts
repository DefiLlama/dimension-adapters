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

  dailyFees.add(FIBO_USDC, data.dailyFeesUsdc, "Round settlement fee accruals");
  dailyRevenue.add(
    FIBO_USDC,
    data.dailyRevenueUsdc,
    "Treasury fee revenue (round settlements)",
  );
  dailyProtocolRevenue.add(
    FIBO_USDC,
    data.dailyProtocolRevenueUsdc,
    "Treasury revenue",
  );
  dailySupplySideRevenue.add(
    FIBO_USDC,
    data.dailySupplySideRevenueUsdc,
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
  pullHourly: true,
  methodology: {
    Fees: "Protocol fee accruals on settled FIBO parimutuel rounds (treasury_flows fee_accrual via api.fibo.fun).",
    Revenue: "Fees retained by protocol treasury (100% of fees).",
    ProtocolRevenue: "All fee revenue to treasury.",
    SupplySideRevenue:
      "None — winners are paid from the parimutuel pool, not a separate supply-side fee share.",
  },
  breakdownMethodology: {
    Fees: {
      "Round settlement fee accruals":
        "USDC protocol fees accrued on settled FIBO parimutuel rounds (treasury_flows fee_accrual via api.fibo.fun)",
    },
    Revenue: {
      "Treasury fee revenue (round settlements)":
        "Fees retained by FIBO protocol treasury (100% of round settlement fees)",
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
