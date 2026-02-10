import { Adapter, FetchOptions, FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { METRIC } from "../../helpers/metrics"

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances()
  const { daily } = await fetchURL(
    `https://beta.strikefinance.org/api/analytics/fees?from=${options.startTimestamp}&to=${options.endTimestamp}`
  );

  dailyFees.addCGToken("cardano", Number(daily.totalRevenueByAsset.ADA));
  dailySupplySideRevenue.addCGToken("cardano", Number(daily.liquidationRevenueByAsset.ADA), METRIC.LIQUIDATION_FEES)
  dailySupplySideRevenue.addCGToken("cardano", Number(daily.tradingRevenueByAsset.ADA), METRIC.LP_FEES)
  dailySupplySideRevenue.addCGToken("cardano", Number(daily.lpOpenFeesByAsset.ADA), METRIC.OPEN_CLOSE_FEES)
  dailyHoldersRevenue.addCGToken("cardano", Number(daily.stakingOpenFeesByAsset.ADA), METRIC.OPEN_CLOSE_FEES);

  if (daily.totalRevenueByAsset.SNEK) {
    dailyFees.addCGToken("snek", Number(daily.totalRevenueByAsset.SNEK));
    dailySupplySideRevenue.addCGToken("snek", Number(daily.liquidationRevenueByAsset.SNEK), METRIC.LIQUIDATION_FEES)
    dailySupplySideRevenue.addCGToken("snek", Number(daily.tradingRevenueByAsset.SNEK), METRIC.LP_FEES)
    dailySupplySideRevenue.addCGToken("snek", Number(daily.lpOpenFeesByAsset.SNEK), METRIC.OPEN_CLOSE_FEES)
    dailyHoldersRevenue.addCGToken("snek", Number(daily.stakingOpenFeesByAsset.SNEK), METRIC.OPEN_CLOSE_FEES);
  }

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue: dailyHoldersRevenue,
    dailyHoldersRevenue,
    dailyProtocolRevenue: 0,
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
    SupplySideRevenue: "Includes liquidation fees, trader losses, borrow and open fees",
    Revenue: "Strike keeps a portion of opening fees.",
    ProtocolRevenue: "No protocol revenue.",
    HoldersRevenue: "100% of the opening fees that goes to Strike is distributed to $STRIKE"
  },
  breakdownMethodology: {
    SupplySideRevenue: {
        [METRIC.LIQUIDATION_FEES]: "100% of liquidated collateral from positions that get liquidated goes to LPs",
        [METRIC.LP_FEES]: "100% of trader losses when positions close at a loss and 100% of hourly borrow fees paid by traders go to LPs",
        [METRIC.OPEN_CLOSE_FEES]: "A percentage of opening fees charged when traders open new positions goes to LPs"
    },
    HoldersRevenue: {
      [METRIC.OPEN_CLOSE_FEES]: "100% of the opening fees that goes to Strike is distributed to $STRIKE stakers once every 3 epochs"
    }
  }
};

export default adapter;
